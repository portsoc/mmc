// Shared state for the canvas page, used by app.js and the panels split out
// of it (history, contributors, menus).

export const FIELD_ELEMENT_IDS = { title: 'title', by: 'by', kp: 'ekp', ka: 'eka', vp: 'evp', bs: 'ebs', be: 'ebe', kr: 'ekr', de: 'ede', mb: 'emb', if: 'eif' };

export const state = { canvasId: null, readOnly: false, isOwner: false, collab: null, raggedLinks: null, panelFocus: null };

// Per-viewer display preferences (Settings dialog). Browser storage can be
// unavailable, so every access is guarded and defaults always apply.
const PREFS_KEY = 'mmc-prefs';
export const prefs = { highlightContributors: false, dimUnfocused: false, flashChanges: true, playbackSpeed: 1 };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
} catch { /* defaults */ }
export function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* not persisted */ }
}

export function elementsById() {
  const out = {};
  for (const [fieldId, domId] of Object.entries(FIELD_ELEMENT_IDS)) {
    out[fieldId] = document.getElementById(domId);
  }
  return out;
}
