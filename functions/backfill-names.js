// One-off: fills canvases.memberNames with each member's first name from
// their Google account, for canvases created before names were recorded.
// Run: node functions/backfill-names.js [--write]
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'mission-mmc-4476' });

(async () => {
  const write = process.argv.includes('--write');
  const db = admin.firestore();
  const cache = new Map();
  const nameOf = async (uid) => {
    if (!cache.has(uid)) {
      const user = await admin.auth().getUser(uid).catch(() => null);
      const full = user?.displayName || '';
      cache.set(uid, full.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || null);
    }
    return cache.get(uid);
  };
  const snap = await db.collection('canvases').get();
  for (const doc of snap.docs) {
    const { roles = {}, memberNames = {} } = doc.data();
    const update = {};
    for (const uid of Object.keys(roles)) {
      if (memberNames[uid]) continue;
      const name = await nameOf(uid);
      if (name) update[`memberNames.${uid}`] = name;
    }
    if (!Object.keys(update).length) continue;
    console.log(doc.id, update);
    if (write) await doc.ref.update(update);
  }
  console.log(write ? 'written' : 'dry run');
})();
