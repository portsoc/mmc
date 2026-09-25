// WP-B — One-off: writes access/{canvasId} for every existing canvas, so the
// Realtime Database rules recognise their collaborators. Run once, before
// deploying database.rules.json:
//   cd functions && GOOGLE_CLOUD_PROJECT=mission-mmc-4476 node backfill-access.js
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getDatabase } = require('firebase-admin/database');

initializeApp({ databaseURL: 'https://mission-mmc-4476-default-rtdb.firebaseio.com' });
const { syncAccess } = require('./access');

(async () => {
  const canvases = await getFirestore().collection('canvases').get();
  for (const snap of canvases.docs) await syncAccess(snap.id, snap.data());
  console.log(`Mirrored access for ${canvases.size} canvases.`);
  await getDatabase().app.delete();
})();
