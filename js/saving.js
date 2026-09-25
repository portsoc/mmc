// The saved copy in Firestore is derived from the merged live doc, not from
// one editor's view, and written once edits pause rather than per keystroke —
// otherwise concurrent typists overwrite each other's latest edit there.
import { updateField, updateSectionItems } from './canvas-data.js';
import { itemsFromY } from './collab.js';
import { state } from './app-state.js';
import { syncFeedback, toastManager } from './feedback.js';

const SAVE_DELAY_MS = 2000;
const pendingSaves = new Map(); // fieldId -> fallback value if there is no live doc
let saveTimer = null;

export function scheduleSave(fieldId, fallback) {
  pendingSaves.set(fieldId, fallback);
  syncFeedback.markPending();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaves, SAVE_DELAY_MS);
}

export function flushSaves() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!state.canvasId || state.readOnly) {
    pendingSaves.clear();
    syncFeedback.pendingEdits = false;
    return syncFeedback.render();
  }
  for (const [fieldId, fallback] of pendingSaves) {
    const yarr = state.collab?.yItems?.[fieldId];
    const ytext = state.collab?.yFields?.[fieldId];
    const save = Array.isArray(fallback)
      ? updateSectionItems(state.canvasId, fieldId, yarr ? itemsFromY(yarr) : fallback)
      : updateField(state.canvasId, fieldId, ytext ? ytext.toString() : fallback);
    save.then(() => {
      if (!failedSaves.size) failureToastShown = false;
    }, (err) => {
      console.warn('[app] saving', fieldId, 'failed:', err);
      failedSaves.set(fieldId, fallback);
      reportSaveFailure(err);
    });
  }
  pendingSaves.clear();
}

// Failed fields are kept so Retry (or coming back online) re-sends them,
// rather than leaving the saved copy stale until that section is edited again.
const failedSaves = new Map();
let failureToastShown = false;

export function retryFailedSaves() {
  if (!failedSaves.size) return syncFeedback.clearError();
  for (const [fieldId, fallback] of failedSaves) pendingSaves.set(fieldId, fallback);
  failedSaves.clear();
  failureToastShown = false;
  syncFeedback.clearError();
  flushSaves();
}

function reportSaveFailure(err) {
  if (failureToastShown) return;
  failureToastShown = true;
  if (err?.code === 'permission-denied') {
    toastManager.error("You can't edit this canvas any more — it may have been moved to the bin or your access removed. Reload to check.", { duration: 10000 });
    return;
  }
  toastManager.error("Couldn't save your latest changes to the cloud. They're still in this tab.", {
    duration: 0,
    action: { label: 'Retry', onClick: retryFailedSaves }
  });
}

addEventListener('online', retryFailedSaves);

addEventListener('pagehide', flushSaves);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSaves();
});

// Warn before leaving while edits haven't reached the server yet.
addEventListener('beforeunload', (e) => {
  if (!state.canvasId || state.readOnly) return;
  if (pendingSaves.size || failedSaves.size || syncFeedback.inFlightSaves > 0 || !syncFeedback.isOnline) {
    flushSaves();
    e.preventDefault();
  }
});
