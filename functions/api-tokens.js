// WP-J — Personal API tokens for AI connectors (MCP clients).
//
// A token is shown to its owner once, at creation. Only its SHA-256 hash is
// stored, as the id of api_tokens/{hash}, which firestore.rules keeps closed
// to browsers: these callables and the MCP endpoint are the only readers.
const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const TOKEN_PREFIX = 'mmc_';
const MAX_TOKENS_PER_USER = 10;
const MAX_NAME_LENGTH = 60;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newToken() {
  return TOKEN_PREFIX + crypto.randomBytes(24).toString('base64url');
}

function requireUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  return uid;
}

exports.createApiToken = onCall(async (request) => {
  const uid = requireUid(request);
  const name = String(request.data?.name || '').trim().slice(0, MAX_NAME_LENGTH) || 'AI connector';

  const db = getFirestore();
  const existing = await db.collection('api_tokens').where('uid', '==', uid).count().get();
  if (existing.data().count >= MAX_TOKENS_PER_USER) {
    throw new HttpsError('resource-exhausted', `You can have at most ${MAX_TOKENS_PER_USER} tokens. Revoke one first.`);
  }

  const token = newToken();
  await db.doc(`api_tokens/${hashToken(token)}`).set({
    uid,
    name,
    hint: token.slice(-4),
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: null
  });
  return { token, name };
});

exports.listApiTokens = onCall(async (request) => {
  const uid = requireUid(request);
  const snap = await getFirestore().collection('api_tokens').where('uid', '==', uid).get();
  const tokens = snap.docs.map((doc) => {
    const t = doc.data();
    return {
      id: doc.id,
      name: t.name,
      hint: t.hint,
      createdAt: t.createdAt?.toDate().toISOString() ?? null,
      lastUsedAt: t.lastUsedAt?.toDate().toISOString() ?? null
    };
  });
  tokens.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return { tokens };
});

exports.revokeApiToken = onCall(async (request) => {
  const uid = requireUid(request);
  const id = String(request.data?.id || '');
  const ref = getFirestore().doc(`api_tokens/${id}`);
  const snap = id ? await ref.get() : null;
  // Same answer for "not yours" and "doesn't exist", so ids can't be probed.
  if (!snap?.exists || snap.data().uid !== uid) throw new HttpsError('not-found', 'Token not found.');
  await ref.delete();
  return { revoked: true };
});

/** The uid a presented token belongs to, or null. Used by the MCP endpoint. */
exports.verifyApiToken = async function verifyApiToken(token) {
  if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return null;
  const ref = getFirestore().doc(`api_tokens/${hashToken(token)}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});
  return snap.data().uid;
};

exports.hashToken = hashToken;
