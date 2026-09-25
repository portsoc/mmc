// WP08 — Wires collaboration modules (auth, canvas-data, collab, versions,
// metrics, playback) to the toolbar and dialogs added to index.html.
//
// This runs alongside the legacy script.js (local-storage editing, defocus,
// hash presentation) unchanged — see WP09 for the migration path between
// the two. Everything here degrades to a no-op if Firebase isn't reachable
// (e.g. firebase-config.js still has placeholder credentials), so the
// vanilla local-only canvas keeps working per the "graceful fallback"
// design invariant.
import { initAuth, currentUser, onUser, signInWithGoogle, signOutUser, firstName } from './auth.js';
import { functions, onRtdbConnectionChange } from './firebase-config.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js';
import {
  createCanvas,
  listCanvasesFor,
  setInBin,
  getCanvas,
  getCanvasIdFromToken,
  updateField,
  updateSectionItems,
  upgradeCanvasItems,
  createInvite,
  redeemInvite,
  listInvites,
  readOnlyUrlFor,
  inviteUrlFor,
  setPublicReadOnly
} from './canvas-data.js';
import { applyLocalItems, bindCollaborativeFields, colorForUser, itemsFromY, setDomSyncPaused, setFieldTexts } from './collab.js';
import { createWaypoint, maybeCreateDailySnapshot, restoreVersion } from './versions.js';
import { recordEdit, getContributionMetrics } from './metrics.js';
import { changedChars } from './text-diff.js';
import { PlaybackController } from './playback.js';
import { canEdit, isOwner } from './roles.js';
import { showCanvasList, showCanvasListSkeleton, showCanvasListError } from './canvas-list.js';
import { RaggedLinksController } from './ragged-links.js';
import { normalizeCanvas, itemsToPlainText } from './item-migration.js';
import { PanelFocusManager, CANVAS_PANELS } from './panel-focus.js';
import { errorReporter } from './error-reporter.js';
import { syncFeedback, toastManager } from './feedback.js';

const FIELD_ELEMENT_IDS = { title: 'title', by: 'by', kp: 'ekp', ka: 'eka', vp: 'evp', bs: 'ebs', be: 'ebe', kr: 'ekr', de: 'ede', mb: 'emb', if: 'eif' };

const state = { canvasId: null, readOnly: false, isOwner: false, collab: null, raggedLinks: null, panelFocus: null };

// Per-viewer display preferences (Settings dialog). Browser storage can be
// unavailable, so every access is guarded and defaults always apply.
const PREFS_KEY = 'mmc-prefs';
const prefs = { highlightContributors: false, flashChanges: true, playbackSpeed: 1 };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
} catch { /* defaults */ }
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* not persisted */ }
}

function elementsById() {
  const out = {};
  for (const [fieldId, domId] of Object.entries(FIELD_ELEMENT_IDS)) {
    out[fieldId] = document.getElementById(domId);
  }
  return out;
}

/** Browsers leave a stray <br> behind when a contenteditable is emptied,
 * which defeats the :empty placeholder, so strip it. Also mirrors the
 * canvas title into the tab title. */
function wireFieldChrome(els) {
  const syncTabTitle = () => {
    const title = els.title?.textContent.trim();
    document.title = title ? `MMC: ${title}` : 'Portsmouth MMC';
  };
  for (const fieldId of ['title', 'by']) {
    const el = els[fieldId];
    el?.addEventListener('input', () => {
      if (!el.textContent.trim()) el.replaceChildren();
    });
  }
  if (!els.title) return;
  // Single-line field: Enter finishes editing rather than adding a line.
  els.title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      els.title.blur();
    }
  });
  // Observer rather than 'input' so remote edits update the tab too.
  new MutationObserver(syncTabTitle).observe(els.title, { childList: true, characterData: true, subtree: true });
  syncTabTitle();
}

async function resolveCanvasId() {
  const path = window.location.pathname;
  const viewMatch = path.match(/^\/view\/([\w-]+)$/);
  if (viewMatch) {
    state.readOnly = true;
    return getCanvasIdFromToken(viewMatch[1]);
  }
  const canvasMatch = path.match(/^\/canvas\/([\w-]+)$/);
  if (canvasMatch) return canvasMatch[1];

  const inviteMatch = path.match(/^\/invite\/([\w-]+)\/([\w-]+)$/);
  if (inviteMatch) {
    const [, canvasId, inviteId] = inviteMatch;
    await redeemInvite(canvasId, inviteId);
    window.history.replaceState(null, '', `/canvas/${canvasId}`);
    return canvasId;
  }

  if (path === '/' || path === '') return 'ROOT';
  if (path === '/canvases') return 'LIST';
  if (path === '/new') return 'NEW';

  // Unrecognized path — fall back to legacy local-only mode (no Firebase canvas).
  return null;
}

function renderPresence(awarenessState) {
  const container = document.getElementById('presence-avatars');
  if (!container) return;
  container.innerHTML = '';
  for (const [uid, info] of Object.entries(awarenessState || {})) {
    const pill = document.createElement('div');
    pill.className = 'presence-avatar';
    pill.style.background = colorForUser(uid);
    pill.title = info.name || 'Collaborator';
    pill.textContent = (info.name || '?').slice(0, 1).toUpperCase();
    container.appendChild(pill);
  }
}

async function renderCollaboratorList() {
  const list = document.getElementById('collaborator-list');
  if (!list || !state.canvasId) return;
  list.innerHTML = '';

  const canvas = await getCanvas(state.canvasId);
  for (const [uid, role] of Object.entries(canvas?.roles || {})) {
    const item = document.createElement('li');
    item.textContent = `${uid === currentUser.value?.uid ? 'You' : uid} — ${role}`;
    list.appendChild(item);
  }

  const invites = await listInvites(state.canvasId);
  for (const invite of invites.filter((i) => i.status === 'pending')) {
    const item = document.createElement('li');
    item.className = 'invite-pending';
    item.textContent = `${invite.email} — ${invite.role} (pending)`;
    list.appendChild(item);
  }
}

/** Shows the full-screen login gate. signInWithGoogle() navigates the whole
 * page to Google and back (see auth.js) rather than returning here — so
 * this never resolves in the tab that showed the gate. The tab that comes
 * back from the redirect re-runs init() from scratch, and initAuth() there
 * finds currentUser.value already set, so the gate is skipped entirely. */
// Same owner test as firestore.rules, which only lets the owner restore.
function showBinNotice(canRestore) {
  document.getElementById('bin-notice').hidden = false;
  if (!canRestore) {
    document.getElementById('bin-notice-text').textContent = "The owner has moved this canvas to the bin, so it can't be changed.";
    return;
  }
  const restore = document.getElementById('bin-notice-restore');
  restore.hidden = false;
  restore.addEventListener('click', async () => {
    restore.disabled = true;
    try {
      await setInBin(state.canvasId, false);
      window.location.reload();
    } catch (err) {
      restore.disabled = false;
      alert(`Couldn't restore the canvas: ${err.message}`);
    }
  });
}

function awaitGoogleSignIn() {
  const gate = document.getElementById('login-gate');
  const btn = document.getElementById('login-google-btn');
  const error = document.getElementById('login-error');
  gate.hidden = false;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    error.hidden = true;
    try {
      await signInWithGoogle();
    } catch (err) {
      error.textContent = `Sign-in failed: ${err.message}`;
      error.hidden = false;
      btn.disabled = false;
    }
  });
}

function wireSettings() {
  const modal = document.getElementById('settings-modal');
  const account = document.getElementById('settings-account');
  const signoutBtn = document.getElementById('settings-signout');
  const highlight = document.getElementById('pref-highlight-contributors');
  const flash = document.getElementById('pref-flash-changes');
  const speed = document.getElementById('pref-playback-speed');

  onUser((user) => {
    account.textContent = user
      ? `Signed in as ${firstName(user)}`
      : 'Not signed in';
    signoutBtn.hidden = !user;
  });

  highlight.checked = prefs.highlightContributors;
  flash.checked = prefs.flashChanges;
  speed.value = String(prefs.playbackSpeed);

  document.getElementById('settings-btn')?.addEventListener('click', () => modal.showModal());
  document.getElementById('settings-close')?.addEventListener('click', () => modal.close());
  signoutBtn.addEventListener('click', async () => {
    await signOutUser();
    window.location.reload();
  });
  highlight.addEventListener('change', () => {
    prefs.highlightContributors = highlight.checked;
    savePrefs();
    refreshContributorHighlight();
  });
  flash.addEventListener('change', () => {
    prefs.flashChanges = flash.checked;
    savePrefs();
  });
  speed.addEventListener('change', () => {
    prefs.playbackSpeed = Number(speed.value);
    savePrefs();
  });
}

function wireDiagnosticsModal() {
  const modal = document.getElementById('diagnostics-modal');
  const pre = document.getElementById('diagnostics-text');
  const copyBtn = document.getElementById('diagnostics-copy');
  const clearBtn = document.getElementById('diagnostics-clear');
  const closeBtn = document.getElementById('diagnostics-close');

  function openDiagnostics() {
    if (pre) pre.textContent = errorReporter.formatDiagnostics();
    if (modal && typeof modal.showModal === 'function') modal.showModal();
  }

  document.getElementById('diagnostics-btn')?.addEventListener('click', openDiagnostics);
  document.getElementById('settings-diagnostics')?.addEventListener('click', () => {
    document.getElementById('settings-modal')?.close();
    openDiagnostics();
  });

  closeBtn?.addEventListener('click', () => modal?.close());
  clearBtn?.addEventListener('click', () => {
    errorReporter.clearLogs();
    if (pre) pre.textContent = errorReporter.formatDiagnostics();
    toastManager.info('Diagnostic logs cleared');
  });
  copyBtn?.addEventListener('click', async () => {
    const text = errorReporter.formatDiagnostics();
    try {
      await navigator.clipboard.writeText(text);
      toastManager.success('Diagnostics copied to clipboard');
    } catch {
      toastManager.info('Could not auto-copy. Select and copy from the text box.');
    }
  });

  return { openDiagnostics };
}

function wireAppMenu() {
  const menuBtn = document.getElementById('menu-btn');
  const menu = document.getElementById('app-menu');
  if (!menuBtn || !menu) return;

  function setOpen(open) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }

  menuBtn.addEventListener('click', () => setOpen(menu.hidden));
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) setOpen(false);
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('.app-menu-item')) setOpen(false);
  });
}

function wireShareModal() {
  const modal = document.getElementById('share-modal');
  document.getElementById('share-btn')?.addEventListener('click', async () => {
    if (!state.canvasId) return;
    const canvas = await getCanvas(state.canvasId);
    document.getElementById('share-readonly-url').value = readOnlyUrlFor(canvas.readOnlyToken);
    document.getElementById('share-public-toggle').checked = !!canvas.isPublicReadOnlyEnabled;
    await renderCollaboratorList();
    modal.showModal();
  });
  document.getElementById('share-copy-link')?.addEventListener('click', () => {
    const input = document.getElementById('share-readonly-url');
    input.select();
    navigator.clipboard?.writeText(input.value);
  });
  document.getElementById('share-public-toggle')?.addEventListener('change', async (e) => {
    if (!state.canvasId) return;
    await setPublicReadOnly(state.canvasId, e.target.checked);
  });
  document.getElementById('invite-send')?.addEventListener('click', async () => {
    const email = document.getElementById('invite-email').value.trim();
    const role = document.getElementById('invite-role').value;
    if (!email || !state.canvasId) return;
    const inviteToken = await createInvite(state.canvasId, currentUser.value.uid, email, role);
    document.getElementById('invite-email').value = '';
    await renderCollaboratorList();
    console.info('[app] Invite link (send this to the invitee):', inviteUrlFor(state.canvasId, inviteToken));
  });
  document.getElementById('share-close')?.addEventListener('click', () => modal.close());
}

function wireNameVersion(onSaved) {
  const modal = document.getElementById('name-version-modal');
  const nameInput = document.getElementById('version-name');
  const noteInput = document.getElementById('version-note');
  const saveBtn = document.getElementById('name-version-save');

  document.getElementById('name-version-btn')?.addEventListener('click', () => {
    nameInput.value = '';
    noteInput.value = '';
    modal.showModal();
    nameInput.focus();
  });
  document.getElementById('name-version-cancel')?.addEventListener('click', () => modal.close());
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
  });
  saveBtn.addEventListener('click', async () => {
    if (!state.canvasId) return;
    saveBtn.disabled = true;
    try {
      const name = nameInput.value.trim() || 'Untitled version';
      await createWaypoint(state.canvasId, name, noteInput.value.trim(), currentUser.value);
      modal.close();
      onSaved?.();
    } finally {
      saveBtn.disabled = false;
    }
  });
}

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

async function refreshContributorHighlight() {
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
function wireEditMetrics() {
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

function wireMetricsModal() {
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

function formatVersionDate(version) {
  const date = version.createdAt?.toDate?.();
  return date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : version.dateKey || '';
}

/** Version history sidebar: lists every saved version newest first, shows
 * the selected one on the canvas (read-only), plays them in order, and lets
 * the owner restore one. Closing always returns the canvas to live text. */
function wireHistory() {
  const dock = document.getElementById('history-dock');
  const list = document.getElementById('history-list');
  const status = document.getElementById('history-status');
  const playBtn = document.getElementById('history-play');
  const pauseBtn = document.getElementById('history-pause');
  const restoreBar = document.getElementById('history-selected-actions');
  const els = elementsById();
  let controller = null;
  let liveSnapshot = null; // read-only views have no shared doc to read live text from
  let liveItemsSnapshot = null;

  function liveItems() {
    if (!state.collab) return liveItemsSnapshot;
    return Object.fromEntries(Object.entries(state.collab.yItems).map(([f, yarr]) => [f, itemsFromY(yarr)]));
  }

  function liveFields() {
    if (!state.collab) return liveSnapshot;
    const fields = Object.fromEntries(Object.entries(state.collab.yFields).map(([f, ytext]) => [f, ytext.toString()]));
    for (const [f, items] of Object.entries(liveItems())) fields[f] = itemsToPlainText(items);
    return fields;
  }

  function setEditable(editable) {
    for (const el of Object.values(els)) el?.setAttribute('contenteditable', editable ? 'plaintext-only' : 'false');
  }

  function renderList() {
    list.replaceChildren();
    for (let i = controller.liveIndex; i >= 0; i--) {
      const version = controller.versionAt(i);
      const li = document.createElement('li');
      li.dataset.index = String(i);
      li.tabIndex = 0;
      const name = document.createElement('span');
      name.className = 'history-name';
      const meta = document.createElement('span');
      meta.className = 'history-meta';
      if (!version) {
        name.textContent = 'Current version';
        meta.textContent = 'Live';
      } else if (version.type === 'manual') {
        li.classList.add('named');
        name.textContent = version.name;
        meta.textContent = [formatVersionDate(version), version.createdBy?.name].filter(Boolean).join(' · ');
        if (version.description) li.title = version.description;
      } else {
        name.textContent = 'Daily snapshot';
        meta.textContent = version.dateKey;
      }
      li.append(name, meta);
      li.addEventListener('click', () => {
        controller.pause();
        controller.seek(i);
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          li.click();
        }
      });
      list.appendChild(li);
    }
  }

  function onStep(index, version) {
    for (const li of list.children) li.classList.toggle('current', Number(li.dataset.index) === index);
    list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
    status.textContent = version ? 'Viewing an earlier version (read-only)' : 'Showing the current version';
    restoreBar.hidden = !version || !state.isOwner || !state.collab;
    state.raggedLinks?.update();
  }

  async function open() {
    liveSnapshot = Object.fromEntries(Object.entries(els).map(([f, el]) => [
      f,
      ['title', 'by'].includes(f) ? (el?.textContent ?? '') : (state.raggedLinks?.serializeSection(el) ?? (el?.textContent ?? ''))
    ]));
    liveItemsSnapshot = state.raggedLinks
      ? Object.fromEntries(Object.entries(els).filter(([f]) => !['title', 'by'].includes(f))
        .map(([f, el]) => [f, state.raggedLinks.serializeSectionItems(el)]))
      : null;
    controller = new PlaybackController(state.canvasId, els, liveFields, state.raggedLinks, liveItems);
    controller.onStep = onStep;
    controller.onPlayingChange = (playing) => {
      playBtn.hidden = playing;
      pauseBtn.hidden = !playing;
    };
    await controller.load();
    document.activeElement?.blur?.();
    setDomSyncPaused(true);
    setEditable(false);
    renderList();
    onStep(controller.liveIndex, null);
    dock.hidden = false;
    document.body.classList.add('history-active');
  }

  function close() {
    if (!controller) return;
    controller.pause();
    controller.diffHighlight = false;
    controller.seek(controller.liveIndex);
    setDomSyncPaused(false);
    if (!state.readOnly) setEditable(true);
    dock.hidden = true;
    document.body.classList.remove('history-active');
    controller = null;
    state.raggedLinks?.update();
  }

  document.getElementById('history-btn')?.addEventListener('click', () => {
    if (state.canvasId) (dock.hidden ? open() : close());
  });
  document.getElementById('history-exit')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && controller && !document.querySelector('dialog[open]')) close();
  });
  playBtn.addEventListener('click', () => {
    controller.diffHighlight = prefs.flashChanges;
    controller.setSpeed(prefs.playbackSpeed);
    controller.play();
  });
  pauseBtn.addEventListener('click', () => controller?.pause());
  document.getElementById('history-restore')?.addEventListener('click', async () => {
    const version = controller?.versionAt(controller.currentIndex);
    if (!version || !state.collab) return;
    const label = version.type === 'manual' ? `"${version.name}"` : `the snapshot from ${version.dateKey}`;
    if (!confirm(`Restore ${label}? The current canvas is saved as a version first, so this can be undone.`)) return;
    const restored = await restoreVersion(state.canvasId, version.id, currentUser.value);
    const restoredFields = restored?.fields || version.fields;
    const restoredItems = restored?.items || version.items;
    const headerTexts = Object.fromEntries(Object.entries(restoredFields).filter(([f]) => ['title', 'by'].includes(f)));
    setFieldTexts(state.collab.ydoc, state.collab.yFields, headerTexts, state.collab.provider._localOrigin);
    for (const [fieldId, text] of Object.entries(restoredFields)) {
      const el = els[fieldId];
      if (!el) continue;
      if (['title', 'by'].includes(fieldId)) {
        el.textContent = text;
      } else if (state.raggedLinks) {
        if (restoredItems?.[fieldId]) {
          state.raggedLinks.setSectionItems(el, restoredItems[fieldId]);
        } else {
          state.raggedLinks.setSectionText(el, text);
        }
        applyLocalItems(state.collab, fieldId, state.raggedLinks.serializeSectionItems(el));
      }
    }
    close();
  });

  return {
    async reload() {
      if (!controller) return;
      await controller.load();
      renderList();
      controller.seek(controller.liveIndex);
    }
  };
}

// The saved copy in Firestore is derived from the merged live doc, not from
// one editor's view, and written once edits pause rather than per keystroke —
// otherwise concurrent typists overwrite each other's latest edit there.
const SAVE_DELAY_MS = 2000;
const pendingSaves = new Map(); // fieldId -> fallback value if there is no live doc
let saveTimer = null;

function scheduleSave(fieldId, fallback) {
  pendingSaves.set(fieldId, fallback);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaves, SAVE_DELAY_MS);
}

function flushSaves() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!state.canvasId || state.readOnly) return pendingSaves.clear();
  for (const [fieldId, fallback] of pendingSaves) {
    const yarr = state.collab?.yItems?.[fieldId];
    const ytext = state.collab?.yFields?.[fieldId];
    const save = Array.isArray(fallback)
      ? updateSectionItems(state.canvasId, fieldId, yarr ? itemsFromY(yarr) : fallback)
      : updateField(state.canvasId, fieldId, ytext ? ytext.toString() : fallback);
    save.catch((err) => console.warn('[app] saving', fieldId, 'failed:', err));
  }
  pendingSaves.clear();
}

addEventListener('pagehide', flushSaves);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSaves();
});

function initRaggedLinks(els) {
  if (!els) return;
  state.raggedLinks = new RaggedLinksController(els, (fieldId, items, newText) => {
    if (state.canvasId && !state.readOnly) {
      applyLocalItems(state.collab, fieldId, items);
      scheduleSave(fieldId, items);
    }
  });
}

function initPanelFocus() {
  if (state.panelFocus) return;

  const gridEls = {};
  for (const pid of CANVAS_PANELS) {
    gridEls[pid] = document.getElementById(pid);
  }

  state.panelFocus = new PanelFocusManager(gridEls, ({ panelId, itemId, itemIndex, offset, immediate }) => {
    if (state.collab?.provider && currentUser.value) {
      state.collab.provider.setLocalAwareness(currentUser.value.uid, {
        name: firstName(currentUser.value),
        color: colorForUser(currentUser.value.uid),
        panelId,
        itemId,
        itemIndex,
        offset
      }, immediate);
    }
  });

  if (currentUser.value) {
    state.panelFocus.setMyUid(currentUser.value.uid);
  }

  const getTargetPanelId = (el) => {
    if (!el || el === document.body) return null;
    const gridItem = el.closest?.('.grid-item');
    if (gridItem && CANVAS_PANELS.includes(gridItem.id)) return gridItem.id;
    const sec = el.closest?.('.e');
    if (sec && sec.id?.startsWith('e')) {
      const pid = sec.id.slice(1);
      if (CANVAS_PANELS.includes(pid)) return pid;
    }
    return null;
  };

  const getActiveItemInfo = (target) => {
    const li = target?.closest?.('li');
    const itemId = li?.dataset?.id || null;
    let itemIndex = null;
    if (li && li.parentElement) {
      itemIndex = Array.prototype.indexOf.call(li.parentElement.children, li);
    }
    const sel = window.getSelection?.();
    const offset = sel ? sel.focusOffset : 0;
    return { itemId, itemIndex: itemIndex >= 0 ? itemIndex : null, offset };
  };

  // Focus event: entering an editable element
  document.addEventListener('focusin', (e) => {
    const panelId = getTargetPanelId(e.target);
    if (panelId) {
      const { itemId, itemIndex, offset } = getActiveItemInfo(e.target);
      state.panelFocus.setLocalFocus(panelId, itemId, offset, true, itemIndex);
    } else {
      state.panelFocus.setLocalFocus(null);
    }
  });

  // Focusout event: leaving an element
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const active = document.activeElement;
      const panelId = getTargetPanelId(active);
      if (!panelId) {
        state.panelFocus.setLocalFocus(null);
      }
    }, 10);
  });

  // Track cursor and typing position within active panel
  const handleCursorMove = (immediate = false) => {
    if (!state.panelFocus?.localPanelId) return;
    const sel = window.getSelection?.();
    if (!sel || !sel.anchorNode) return;
    const node = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
    const panelId = getTargetPanelId(node);
    if (panelId === state.panelFocus.localPanelId) {
      const { itemId, itemIndex, offset } = getActiveItemInfo(node);
      state.panelFocus.setLocalFocus(panelId, itemId, offset, immediate, itemIndex);
    }
  };

  document.addEventListener('selectionchange', () => handleCursorMove(false));
  document.addEventListener('input', () => handleCursorMove(false));

  // Focus modal closing
  document.getElementById('focus-modal')?.addEventListener('close', () => {
    state.panelFocus?.setLocalFocus(null);
  });
}

// The canvas skeleton is visible from first paint (data-loading shimmers the
// boxes and blocks typing); this clears it once real content is in place.
function doneLoading() {
  const root = document.getElementById('app-root');
  root.removeAttribute('data-loading');
  root.removeAttribute('aria-busy');
}

// Load-stage timings, printed once as `[load] …` so slow stages are visible.
const loadMarks = [];
function markLoad(stage) {
  loadMarks.push([stage, Math.round(performance.now())]);
}
function reportLoad() {
  let prev = 0;
  console.info('[load] ' + loadMarks.map(([stage, t]) => { const d = t - prev; prev = t; return `${stage} +${d}ms`; }).join(' · ') + ` = ${prev}ms`);
}

async function init() {
  markLoad('script');
  initPanelFocus();

  // Initialize diagnostics and user feedback
  const { openDiagnostics } = wireDiagnosticsModal();
  wireAppMenu();
  wireSettings();

  const syncStatusEl = document.getElementById('sync-status');
  if (syncStatusEl) {
    syncFeedback.bindElement(syncStatusEl);
    syncFeedback.onStatusClick = () => openDiagnostics();
  }

  onRtdbConnectionChange((connected) => {
    syncFeedback.setRtdbConnected(connected);
  });

  window.addEventListener('offline', () => {
    toastManager.warning('You are offline. Edits are safely buffered in local storage.', { duration: 5000 });
  });

  window.addEventListener('online', () => {
    toastManager.success('Back online. Synchronizing changes with cloud…', { duration: 4000 });
  });

  errorReporter.addListener((entry) => {
    if (entry.count === 1 && (entry.type === 'firestore_write' || entry.type === 'rtdb_push' || entry.type === 'window_error')) {
      toastManager.error(`Sync warning: ${entry.message}`, {
        duration: 7000,
        action: { label: 'Diagnostics', onClick: openDiagnostics }
      });
    }
  });

  try {
    errorReporter.remoteReporter = httpsCallable(functions, 'reportClientError');
  } catch (err) {
    console.warn('[app] Could not wire remote error reporter:', err);
  }

  onUser((user) => {
    errorReporter.setContext({ uid: user?.uid || null });
    for (const el of document.querySelectorAll('[data-needs-account]')) el.hidden = !user;
  });

  if (window.location.pathname === '/canvases') showCanvasListSkeleton();
  try {
    await initAuth();
    markLoad('auth');
  } catch (err) {
    console.warn('[app] Firebase auth unavailable, staying in local-only mode:', err.message);
    initRaggedLinks(elementsById());
    doneLoading();
    return;
  }

  state.canvasId = await resolveCanvasId();
  if (!state.canvasId) {
    initRaggedLinks(elementsById());
    doneLoading(); // legacy local-only mode; nothing further to wire
    return;
  }
  errorReporter.setContext({ canvasId: state.canvasId });

  // Public read-only links (/view/:token) never require sign-in. Everything
  // else — including editing and viewing a canvas you're a named
  // collaborator on — requires Google sign-in first. Sign-in is a full-page
  // redirect (see awaitGoogleSignIn), so this tab's init() stops here; the
  // tab that comes back from Google re-runs init() and finds currentUser set.
  if (!state.readOnly && !currentUser.value) {
    awaitGoogleSignIn();
    return;
  }

  // Bare root opens your only canvas, starts one if you have none, and lists
  // them if you have several. /canvases always lists; /new always starts one.
  const route = state.canvasId;
  if (route === 'ROOT' || route === 'LIST') {
    let canvases;
    try {
      canvases = await listCanvasesFor(currentUser.value.uid);
    } catch (err) {
      console.warn('[app] Could not list canvases:', err.message);
      showCanvasListError(currentUser.value);
      return;
    }
    const live = canvases.filter((c) => !c.binnedAt);
    const hasBin = canvases.some((c) => c.binnedAt && c.ownerId === currentUser.value.uid);
    // With nothing live but something in the bin, list them so Restore is on
    // offer, rather than quietly starting a fresh canvas.
    if (route === 'LIST' || live.length > 1 || (live.length === 0 && hasBin)) {
      showCanvasList(canvases, currentUser.value);
      return;
    }
    state.canvasId = live[0]?.id ?? 'NEW';
  }
  if (state.canvasId === 'NEW') state.canvasId = await createCanvas(currentUser.value.uid);
  if (state.canvasId !== route) window.history.replaceState(null, '', `/canvas/${state.canvasId}`);
  errorReporter.setContext({ canvasId: state.canvasId });

  // Signed-out visitors on a public link have no canvases of their own.
  for (const el of document.querySelectorAll('[data-needs-account]')) el.hidden = !currentUser.value;

  markLoad('route');
  const canvas = await getCanvas(state.canvasId);
  markLoad('firestore');
  if (!canvas) {
    console.warn('[app] Canvas not found for id', state.canvasId);
    doneLoading();
    return;
  }

  // Normalize canvas to ensure both `items` and `fields` are populated and in sync
  const normalizedCanvas = normalizeCanvas(canvas);

  // If this canvas was created before structured items were introduced, auto-upgrade in background
  if (!canvas.items && !state.readOnly) {
    upgradeCanvasItems(state.canvasId, normalizedCanvas.items).catch(err => {
      console.warn('[app] Auto-upgrade canvas items background sync failed:', err);
    });
  }

  // A signed-in visitor without at least editor rank is read-only too, even
  // when they didn't arrive via a /view/ public token (e.g. a viewer-role
  // collaborator who bookmarked /canvas/<id> directly).
  if (!state.readOnly && !canEdit(canvas, currentUser.value?.uid)) {
    state.readOnly = true;
  }
  // A binned canvas is read-only for everyone until its owner restores it.
  if (canvas.binnedAt) {
    state.readOnly = true;
    showBinNotice(canvas.ownerId === currentUser.value?.uid);
  }
  state.isOwner = isOwner(canvas, currentUser.value?.uid);
  document.getElementById('share-btn')?.toggleAttribute('hidden', !state.isOwner);
  document.getElementById('name-version-btn')?.toggleAttribute('hidden', state.readOnly);

  const els = elementsById();
  wireFieldChrome(els);

  for (const fieldId of ['title', 'by']) {
    const el = els[fieldId];
    if (el) {
      if (state.readOnly) el.setAttribute('contenteditable', 'false');
      el.textContent = normalizedCanvas.fields?.[fieldId] ?? '';
    }
  }

  initRaggedLinks(els);
  if (state.raggedLinks) {
    for (const fieldId of ['kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if']) {
      const el = els[fieldId];
      if (el) {
        if (state.readOnly) el.setAttribute('contenteditable', 'false');
        state.raggedLinks.setSectionItems(el, normalizedCanvas.items[fieldId]);
      }
    }
  }

  markLoad('render');
  if (state.readOnly) {
    doneLoading();
    reportLoad();
  } else {
    try {
      state.collab = await bindCollaborativeFields(state.canvasId, els, normalizedCanvas.fields, normalizedCanvas.items, (fieldId, remoteValue) => {
        if (['title', 'by'].includes(fieldId)) {
          const el = els[fieldId];
          if (el && el.textContent !== remoteValue) {
            el.textContent = remoteValue;
          }
        } else if (state.raggedLinks) {
          const el = els[fieldId];
          if (el) {
            state.raggedLinks.setSectionItems(el, remoteValue);
          }
        }
      });

      if (state.collab?.yFields) {
        // If Yjs already had history from an active peer in RTDB that differs from canvas.fields, sync it to DOM
        for (const [fieldId, ytext] of Object.entries(state.collab.yFields)) {
          const val = ytext.toString();
          if (val && val !== (normalizedCanvas.fields?.[fieldId] ?? '') && els[fieldId]) {
            els[fieldId].textContent = val;
          }
        }
        for (const [fieldId, yarr] of Object.entries(state.collab.yItems)) {
          const live = itemsFromY(yarr);
          if (live.length && state.raggedLinks && els[fieldId]
            && JSON.stringify(live) !== JSON.stringify(state.raggedLinks.serializeSectionItems(els[fieldId]))) {
            state.raggedLinks.setSectionItems(els[fieldId], live);
          }
        }

        const { provider } = state.collab;
        onUser((user) => {
          if (!user) {
            if (currentUser.value) {
              provider.clearLocalAwareness(currentUser.value.uid);
            }
            return;
          }
          state.panelFocus?.setMyUid(user.uid);
          provider.setLocalAwareness(user.uid, {
            name: firstName(user),
            color: colorForUser(user.uid),
            panelId: state.panelFocus?.localPanelId || null,
            itemId: state.panelFocus?.localItemId || null,
            itemIndex: state.panelFocus?.localItemIndex || null,
            offset: state.panelFocus?.localOffset || 0
          }, true);
        });
        provider.onAwarenessChange((awareness) => {
          renderPresence(awareness);
          state.panelFocus?.updateRemoteAwareness(awareness);
        });
      }
    } catch (err) {
      console.warn('[app] Collaborative binding error, continuing with local editing:', err);
    } finally {
      markLoad('live-sync');
      doneLoading();
      reportLoad();
    }

    for (const fieldId of ['title', 'by']) {
      const el = els[fieldId];
      el?.addEventListener('input', (e) => {
        scheduleSave(fieldId, e.target.textContent || '');
      });
    }

    await maybeCreateDailySnapshot(state.canvasId, currentUser.value);
  }

  wireShareModal();
  const history = wireHistory();
  wireNameVersion(() => history.reload());
  wireMetricsModal();
  wireEditMetrics();
  refreshContributorHighlight();
}

// Module scripts run after the DOM is parsed, so no need to wait for every
// image to finish loading before starting auth and data fetches.
init();
