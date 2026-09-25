// The saved copy in Firestore is derived from the merged live doc, not from
// one editor's view, and written once edits pause rather than per keystroke —
// otherwise concurrent typists overwrite each other's latest edit there.
import { updateField, updateSectionItems } from './canvas-data.js';
import { itemsFromY } from './collab.js';
import { state } from './app-state.js';

const SAVE_DELAY_MS = 2000;
const pendingSaves = new Map(); // fieldId -> fallback value if there is no live doc
let saveTimer = null;

export function scheduleSave(fieldId, fallback) {
  pendingSaves.set(fieldId, fallback);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaves, SAVE_DELAY_MS);
}

export function flushSaves() {
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
