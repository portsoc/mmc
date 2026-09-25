// WP08 — Wires collaboration modules (auth, canvas-data, collab, versions,
// metrics, playback) to the toolbar and dialogs added to index.html.
//
// Section chrome (defocus, focus modal, help) lives in canvas-chrome.js.
// Everything here degrades to a no-op if Firebase isn't reachable
// (e.g. firebase-config.js still has placeholder credentials), so the
// vanilla local-only canvas keeps working per the "graceful fallback"
// design invariant.
import { initCanvasChrome } from './canvas-chrome.js';
import { initAuth, currentUser, onUser, signInWithGoogle } from './auth.js';
import { functions, onRtdbConnectionChange } from './firebase-config.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js';
import {
  createCanvas,
  listCanvasesFor,
  setInBin,
  getCanvas,
  getCanvasIdFromToken,
  upgradeCanvasItems,
  redeemInvite
} from './canvas-data.js';
import { applyLocalItems, bindCollaborativeFields, itemsFromY } from './collab.js';
import { maybeCreateDailySnapshot } from './versions.js';
import { canEdit, isOwner } from './roles.js';
import { showCanvasList, showCanvasListSkeleton, showCanvasListError } from './canvas-list.js';
import { RaggedLinksController } from './ragged-links.js';
import { normalizeCanvas } from './item-migration.js';
import { errorReporter } from './error-reporter.js';
import { syncFeedback, toastManager } from './feedback.js';
import { state, elementsById } from './app-state.js';
import { scheduleSave } from './saving.js';
import { initPanelFocus, wirePresence } from './presence.js';
import { wireHistory } from './history-panel.js';
import { refreshContributorHighlight, wireEditMetrics, wireMetricsModal } from './contributors.js';
import { wireSettings, wireDiagnosticsModal, wireAppMenu, wireShareModal, wireNameVersion } from './dialogs.js';

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

/** Shows the full-screen login gate. signInWithGoogle() navigates the whole
 * page to Google and back (see auth.js) rather than returning here — so
 * this never resolves in the tab that showed the gate. The tab that comes
 * back from the redirect re-runs init() from scratch, and initAuth() there
 * finds currentUser.value already set, so the gate is skipped entirely. */
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

function initRaggedLinks(els) {
  if (!els) return;
  state.raggedLinks = new RaggedLinksController(els, (fieldId, items, newText) => {
    if (state.canvasId && !state.readOnly) {
      applyLocalItems(state.collab, fieldId, items);
      scheduleSave(fieldId, items);
    }
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

/** Sync-status pill, offline/online toasts and error reporting. */
function wireFeedback() {
  const { openDiagnostics } = wireDiagnosticsModal();

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
}

/** Turns the URL into a concrete state.canvasId, signing in, listing or
 * creating a canvas on the way as needed. Returns false when the page has
 * become something else (sign-in gate, canvas list, local-only mode). */
async function routeToCanvas() {
  state.canvasId = await resolveCanvasId();
  if (!state.canvasId) {
    initRaggedLinks(elementsById());
    doneLoading(); // legacy local-only mode; nothing further to wire
    return false;
  }
  errorReporter.setContext({ canvasId: state.canvasId });

  // Public read-only links (/view/:token) never require sign-in. Everything
  // else — including editing and viewing a canvas you're a named
  // collaborator on — requires Google sign-in first. Sign-in is a full-page
  // redirect (see awaitGoogleSignIn), so this tab's init() stops here; the
  // tab that comes back from Google re-runs init() and finds currentUser set.
  if (!state.readOnly && !currentUser.value) {
    awaitGoogleSignIn();
    return false;
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
      return false;
    }
    const live = canvases.filter((c) => !c.binnedAt);
    const hasBin = canvases.some((c) => c.binnedAt && c.ownerId === currentUser.value.uid);
    // With nothing live but something in the bin, list them so Restore is on
    // offer, rather than quietly starting a fresh canvas.
    if (route === 'LIST' || live.length > 1 || (live.length === 0 && hasBin)) {
      showCanvasList(canvases, currentUser.value);
      return false;
    }
    state.canvasId = live[0]?.id ?? 'NEW';
  }
  if (state.canvasId === 'NEW') state.canvasId = await createCanvas(currentUser.value.uid);
  if (state.canvasId !== route) window.history.replaceState(null, '', `/canvas/${state.canvasId}`);
  errorReporter.setContext({ canvasId: state.canvasId });

  // Signed-out visitors on a public link have no canvases of their own.
  for (const el of document.querySelectorAll('[data-needs-account]')) el.hidden = !currentUser.value;
  return true;
}

/** Works out this visitor's access and puts the saved text on the page. */
function renderCanvas(canvas) {
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
  return { els, normalizedCanvas };
}

/** Joins the live session, shows any newer text it has, and starts saving. */
async function startLiveSync(els, normalizedCanvas) {
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

      wirePresence(state.collab.provider);
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
}

async function init() {
  markLoad('script');
  initPanelFocus();
  wireFeedback();
  wireAppMenu();
  wireSettings();

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

  if (!(await routeToCanvas())) return;

  markLoad('route');
  const canvas = await getCanvas(state.canvasId);
  markLoad('firestore');
  if (!canvas) {
    console.warn('[app] Canvas not found for id', state.canvasId);
    doneLoading();
    return;
  }

  const { els, normalizedCanvas } = renderCanvas(canvas);
  markLoad('render');
  if (state.readOnly) {
    doneLoading();
    reportLoad();
  } else {
    await startLiveSync(els, normalizedCanvas);
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
initCanvasChrome();
init();
