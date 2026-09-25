// WP-B — The Realtime Database can't read Firestore, so database.rules.json
// can't see who may open a canvas. Each canvas's roles and bin state are
// mirrored to access/{canvasId} here, and the RTDB rules check that mirror.
// Only this server code writes it (database.rules.json denies client writes).
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getDatabase } = require('firebase-admin/database');

function accessFor(data) {
  return { roles: data.roles || {}, binned: !!data.binnedAt };
}

async function syncAccess(canvasId, data) {
  const ref = getDatabase().ref(`access/${canvasId}`);
  if (data) await ref.set(accessFor(data));
  else await ref.remove();
}

// Keeps the mirror in step with every change, including binning, which the
// owner does from the browser.
exports.mirrorCanvasAccess = onDocumentWritten('canvases/{canvasId}', (event) => {
  const after = event.data.after;
  return syncAccess(event.params.canvasId, after.exists ? after.data() : null);
});

exports.syncAccess = syncAccess;
exports.accessFor = accessFor;
