// WP05 Pattern A — scheduled Cloud Function for the Blaze plan. Mirrors the
// client-side lazy fallback in js/versions.js so the same canvas doesn't get
// double-snapshotted regardless of which path fires first (guarded by
// lastSnapshotDate on the canvas doc).
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const FIELD_IDS = ['title', 'by', 'kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if'];

function wordCount(fields) {
  return Object.values(fields).reduce(
    (sum, text) => sum + (text?.trim() ? text.trim().split(/\s+/).length : 0),
    0
  );
}

async function createDailySnapshot(db, canvasId, data, today) {
  const id = `v_${today.replace(/-/g, '')}_auto`;
  await db.doc(`canvases/${canvasId}/versions/${id}`).set({
    id,
    canvasId,
    name: `Daily Snapshot: ${today}`,
    description: '',
    type: 'daily_auto',
    dateKey: today,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: { uid: 'system', name: 'Scheduled Snapshot' },
    fields: data.fields,
    wordCountTotal: wordCount(data.fields || {}),
    stats: { sectionsFilled: FIELD_IDS.filter((f) => data.fields?.[f]?.trim()).length }
  });
}

exports.dailyCanvasSnapshot = onSchedule('0 0 * * *', async () => {
  const db = getFirestore();
  const today = new Date().toISOString().split('T')[0];
  const modifiedSince = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const activeCanvases = await db
    .collection('canvases')
    .where('updatedAt', '>=', modifiedSince)
    .get();

  for (const docSnap of activeCanvases.docs) {
    const data = docSnap.data();
    if (data.lastSnapshotDate !== today && !data.binnedAt) {
      await createDailySnapshot(db, docSnap.id, data, today);
      await docSnap.ref.update({ lastSnapshotDate: today });
    }
  }
});
