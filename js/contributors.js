// Contributor metrics: credit each edit, show the Contributors dialog and
// the optional per-section highlight of the top contributor.
import { currentUser, firstName } from './auth.js';
import { colorForUser } from './collab.js';
import { recordEdit, getContributionMetrics } from './metrics.js';
import { changedChars } from './text-diff.js';
import { FIELD_ELEMENT_IDS, state, prefs, elementsById } from './app-state.js';

function applyContributorHighlight(metrics) {
  const els = elementsById();
  const attribution = metrics?.fieldAttribution || {};
  for (const [fieldId, el] of Object.entries(els)) {
    if (!el) continue;
    const byUid = attribution[fieldId] || {};
    const topUid = Object.keys(byUid).sort((a, b) => byUid[b] - byUid[a])[0];
    el.style.borderLeftColor = topUid ? colorForUser(topUid) : '';
    el.classList.toggle('contributor-highlighted', !!topUid);
  }
}

function clearContributorHighlight() {
  for (const el of Object.values(elementsById())) {
    el?.classList.remove('contributor-highlighted');
    if (el) el.style.borderLeftColor = '';
  }
}

export async function refreshContributorHighlight() {
  if (!prefs.highlightContributors || !state.canvasId) {
    clearContributorHighlight();
    return;
  }
  try {
    applyContributorHighlight(await getContributionMetrics(state.canvasId));
  } catch (err) {
    console.warn('[app] Contributor metrics unavailable:', err.message);
  }
}

/** Credit each local edit with the characters it changed. beforeinput/input
 * fire only for this user's typing, so collaborators' edits aren't counted. */
export function wireEditMetrics() {
  const fieldOf = (target) => {
    for (const [fieldId, domId] of Object.entries(FIELD_ELEMENT_IDS)) {
      if (target?.closest?.(`#${domId}`)) return [fieldId, document.getElementById(domId)];
    }
    return [null, null];
  };
  let before = null; // { fieldId, text }
  document.addEventListener('beforeinput', (e) => {
    const [fieldId, el] = fieldOf(e.target);
    before = fieldId ? { fieldId, text: el.textContent || '' } : null;
  });
  document.addEventListener('input', (e) => {
    const [fieldId, el] = fieldOf(e.target);
    if (!fieldId || before?.fieldId !== fieldId) return;
    const chars = changedChars(before.text, el.textContent || '');
    before = null;
    if (chars && state.canvasId && !state.readOnly && currentUser.value) {
      recordEdit(state.canvasId, fieldId, currentUser.value.uid, firstName(currentUser.value), chars);
    }
  });
}

export function wireMetricsModal() {
  const modal = document.getElementById('metrics-modal');
  document.getElementById('metrics-btn')?.addEventListener('click', async () => {
    if (!state.canvasId) return;
    renderMetrics(await getContributionMetrics(state.canvasId));
    modal.showModal();
  });
  document.getElementById('metrics-close')?.addEventListener('click', () => modal.close());
}

function renderMetrics(metrics) {
  const bar = document.getElementById('metrics-bar');
  const list = document.getElementById('metrics-leaderboard');
  bar.innerHTML = '';
  list.innerHTML = '';
  if (!metrics) return;

  const contributors = Object.entries(metrics.contributors || {}).sort((a, b) => b[1].wordsContributed - a[1].wordsContributed);
  for (const [uid, c] of contributors) {
    const segment = document.createElement('div');
    segment.className = 'metrics-bar-segment';
    segment.style.width = `${c.percentage}%`;
    segment.style.background = c.avatarColor || colorForUser(uid);
    bar.appendChild(segment);

    const item = document.createElement('li');
    item.textContent = `${c.name} — ${c.percentage}% (${c.wordsContributed} words, ${c.editCount} edits)`;
    list.appendChild(item);
  }
}
