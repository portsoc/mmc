// WP03 — Canvas creation runs server-side so the read-only public token can
// be written to public_tokens/{token}, which firestore.rules locks to
// "allow write: if false" (Cloud Functions / trusted context only).
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getDatabase } = require('firebase-admin/database');
const { randomUUID } = require('crypto');
const { syncAccess } = require('./access');

const FIELD_IDS = ['title', 'by', 'kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if'];

exports.createCanvas = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required to create a canvas.');

  const title = request.data?.title || 'Untitled Mission Model Canvas';
  const db = getFirestore();
  const canvasRef = db.collection('canvases').doc();
  const readOnlyToken = randomUUID();
  const emptyFields = Object.fromEntries(FIELD_IDS.map((f) => [f, '']));

  await canvasRef.set({
    id: canvasRef.id,
    title,
    ownerId: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastSnapshotDate: null,
    roles: { [uid]: 'owner' },
    readOnlyToken,
    isPublicReadOnlyEnabled: true,
    fields: emptyFields
  });

  await db.doc(`public_tokens/${readOnlyToken}`).set({
    canvasId: canvasRef.id,
    createdAt: FieldValue.serverTimestamp(),
    active: true
  });

  // Written here as well as by the trigger so the owner can edit live as soon
  // as the canvas opens, without waiting for the trigger to catch up.
  await syncAccess(canvasRef.id, { roles: { [uid]: 'owner' } });

  return { id: canvasRef.id };
});

// Deletes everything in the caller's bin for good: each canvas with its
// versions, invites and metrics, its public link, and its live edit history
// in the Realtime Database. Only canvases the caller owns are touched.
exports.emptyBin = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required to empty the bin.');

  const db = getFirestore();
  const owned = await db.collection('canvases').where('ownerId', '==', uid).get();
  const binned = owned.docs.filter((snap) => snap.get('binnedAt'));

  await Promise.all(binned.map(async (snap) => {
    const token = snap.get('readOnlyToken');
    if (token) await db.doc(`public_tokens/${token}`).delete();
    await getDatabase().ref(`sessions/${snap.id}`).remove();
    await syncAccess(snap.id, null);
    await db.recursiveDelete(snap.ref);
  }));

  return { deleted: binned.length };
});
