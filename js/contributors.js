// Contributor metrics: credit each edit, show the Contributors dialog and
// the optional per-section highlight of the top contributor.
import { currentUser, firstName } from './auth.js';
import { colorForUser } from './collab.js';
import { recordEdit, getContributionMetrics } from './metrics.js';
import { changedChars } from './text-diff.js';
import { FIELD_ELEMENT_IDS, state, prefs, elementsById } from './app-state.js';

// The bar spans a section's whole box; title and author get no bar.
const barHost = (el) => el?.closest('.grid-item');

/** Hard-stop gradient giving each contributor a width equal to their share. */
export function contributorBarGradient(byUid, colorOf) {
  const entries = Object.entries(byUid).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (!total) return '';
  let start = 0;
  const stops = entries.map(([uid, n]) => {
    const end = start + (n / total) * 100;
    const stop = `${colorOf(uid)} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    start = end;
    return stop;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function applyContributorHighlight(metrics) {
  const attribution = metrics?.fieldAttribution || {};
  for (const [fieldId, el] of Object.entries(elementsById())) {
    const host = barHost(el);
    if (!host) continue;
    const gradient = contributorBarGradient(attribution[fieldId] || {}, colorForUser);
    host.style.setProperty('--contrib-bar', gradient || 'none');
    host.classList.toggle('contributor-highlighted', !!gradient);
  }
}

function clearContributorHighlight() {
  for (const el of Object.values(elementsById())) {
    const host = barHost(el);
    if (!host) continue;
    host.classList.remove('contributor-highlighted');
    host.style.removeProperty('--contrib-bar');
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
