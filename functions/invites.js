// WP03 — Invite redemption runs server-side (trusted context) so an
// invitee who isn't yet an editor can still be granted the role: the
// client alone can't pass firestore.rules' isCanvasEditor() check for a
// role it doesn't have yet.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { syncAccess } = require('./access');

exports.redeemInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required to redeem an invite.');

  const { canvasId, inviteId } = request.data;
  if (!canvasId || !inviteId) {
    throw new HttpsError('invalid-argument', 'canvasId and inviteId are required.');
  }

  const db = getFirestore();
  const inviteRef = db.doc(`canvases/${canvasId}/invites/${inviteId}`);
  const canvasRef = db.doc(`canvases/${canvasId}`);

  const result = await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) throw new HttpsError('not-found', 'Invite not found.');

    const invite = inviteSnap.data();
    if (invite.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Invite already used or revoked.');
    }
    if (new Date(invite.expiresAt) < new Date()) {
      throw new HttpsError('failed-precondition', 'Invite expired.');
    }

    tx.update(inviteRef, { status: 'accepted' });
    tx.update(canvasRef, {
      [`roles.${uid}`]: invite.role,
      updatedAt: FieldValue.serverTimestamp()
    });

    return { role: invite.role };
  });

  // So the new collaborator can edit live straight away (see access.js).
  await syncAccess(canvasId, (await canvasRef.get()).data());
  return result;
});
