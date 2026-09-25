// WP03 — Canvas document CRUD, UUID read-only sharing, invite redemption.
import { db, functions } from './firebase-config.js';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js';
import { itemsToPlainText, normalizeSection } from './item-migration.js';
import { syncFeedback } from './feedback.js';
import { errorReporter } from './error-reporter.js';

export const FIELD_IDS = ['title', 'by','kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if'];

export function newCanvasId() {
  return `c_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Retries an async operation with exponential backoff on transient network errors.
 */
export async function withRetry(operation, maxRetries = 3, baseDelay = 800) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (err) {
      attempt++;
      const isRetryable =
        err?.code === 'unavailable' ||
        err?.code === 'resource-exhausted' ||
        err?.code === 'deadline-exceeded' ||
        err?.name === 'TypeError' ||
        (typeof err?.message === 'string' && (
          err.message.includes('network') ||
          err.message.includes('transport') ||
          err.message.includes('offline')
        ));

      if (!isRetryable || attempt >= maxRetries) {
        throw err;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 200;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

// Canvas creation runs server-side (functions/canvases.js): the client can't
// write public_tokens/{token} directly, since firestore.rules locks that
// collection to Cloud Functions / trusted context only.
const createCanvasCallable = httpsCallable(functions, 'createCanvas');

export async function createCanvas(ownerId, title = 'Untitled Mission Model Canvas') {
  const { data } = await createCanvasCallable({ title });
  return data.id;
}

export async function getCanvas(canvasId) {
  try {
    const snap = await getDoc(doc(db, 'canvases', canvasId));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    errorReporter.report('firestore_read', err, { canvasId, operation: 'getCanvas' });
    throw err;
  }
}

/** Every canvas the user has a role on, most recently edited first. The
 * roles filter has to be in the query itself: firestore.rules only lets a
 * list through if it can prove every result is readable. Sorted here rather
 * than with orderBy, which would need a composite index per user. */
export async function listCanvasesFor(uid) {
  try {
    const q = query(collection(db, 'canvases'), where(`roles.${uid}`, 'in', ['owner', 'editor', 'viewer']));
    const snap = await getDocs(q);
    const editedAt = (c) => c.updatedAt?.toMillis?.() ?? 0;
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => editedAt(b) - editedAt(a));
  } catch (err) {
    errorReporter.report('firestore_read', err, { uid, operation: 'listCanvasesFor' });
    throw err;
  }
}

/** Moves a canvas into the owner's bin, or back out with inBin = false. */
export async function setInBin(canvasId, inBin) {
  try {
    await updateDoc(doc(db, 'canvases', canvasId), { binnedAt: inBin ? serverTimestamp() : null });
  } catch (err) {
    errorReporter.report('firestore_write', err, { canvasId, operation: 'setInBin' });
    throw err;
  }
}

// Emptying the bin runs server-side (functions/canvases.js): it also has to
// delete each canvas's subcollections, public link and live edit history.
const emptyBinCallable = httpsCallable(functions, 'emptyBin');

export async function emptyBin() {
  const { data } = await emptyBinCallable();
  return data.deleted;
}

export async function getCanvasIdFromToken(readOnlyToken) {
  try {
    const snap = await getDoc(doc(db, 'public_tokens', readOnlyToken));
    if (!snap.exists() || snap.data().active !== true) return null;
    return snap.data().canvasId;
  } catch (err) {
    errorReporter.report('firestore_read', err, { readOnlyToken, operation: 'getCanvasIdFromToken' });
    throw err;
  }
}

export async function updateField(canvasId, fieldId, value) {
  if (!FIELD_IDS.includes(fieldId)) throw new Error(`Unknown field: ${fieldId}`);
  const updateData = {
    [`fields.${fieldId}`]: value,
    updatedAt: serverTimestamp()
  };
  if (['kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if'].includes(fieldId)) {
    updateData[`items.${fieldId}`] = normalizeSection(value, fieldId);
  }

  syncFeedback.startSave();
  try {
    await withRetry(() => updateDoc(doc(db, 'canvases', canvasId), updateData));
    syncFeedback.finishSave();
  } catch (err) {
    syncFeedback.failSave(err);
    errorReporter.report('firestore_write', err, { canvasId, fieldId, operation: 'updateField' });
    throw err;
  }
}

export async function updateSectionItems(canvasId, fieldId, items) {
  if (!FIELD_IDS.includes(fieldId)) throw new Error(`Unknown field: ${fieldId}`);
  const plainText = itemsToPlainText(items);

  syncFeedback.startSave();
  try {
    await withRetry(() => updateDoc(doc(db, 'canvases', canvasId), {
      [`items.${fieldId}`]: items,
      [`fields.${fieldId}`]: plainText,
      updatedAt: serverTimestamp()
    }));
    syncFeedback.finishSave();
  } catch (err) {
    syncFeedback.failSave(err);
    errorReporter.report('firestore_write', err, { canvasId, fieldId, operation: 'updateSectionItems' });
    throw err;
  }
}

export async function upgradeCanvasItems(canvasId, items) {
  syncFeedback.startSave();
  try {
    await withRetry(() => updateDoc(doc(db, 'canvases', canvasId), {
      items,
      updatedAt: serverTimestamp()
    }));
    syncFeedback.finishSave();
  } catch (err) {
    syncFeedback.failSave(err);
    errorReporter.report('firestore_write', err, { canvasId, operation: 'upgradeCanvasItems' });
    throw err;
  }
}

// --- Collaborator invites -------------------------------------------------

export async function createInvite(canvasId, invitedBy, email, role = 'editor') {
  const inviteId = `inv_${crypto.randomUUID().slice(0, 10)}`;
  const inviteToken = inviteId;
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);

  await setDoc(doc(db, 'canvases', canvasId, 'invites', inviteId), {
    email,
    role,
    invitedBy,
    inviteToken,
    status: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: expires.toISOString()
  });

  return inviteToken;
}

// Invite redemption runs server-side (functions/invites.js): a not-yet-editor
// can't pass firestore.rules' isCanvasEditor() check to grant themself a role,
// so the trusted Cloud Function does the read-validate-write as a transaction.
const redeemInviteCallable = httpsCallable(functions, 'redeemInvite');

export async function redeemInvite(canvasId, inviteId) {
  const { data } = await redeemInviteCallable({ canvasId, inviteId });
  return data.role;
}

export async function listInvites(canvasId) {
  const snap = await getDocs(collection(db, 'canvases', canvasId, 'invites'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function readOnlyUrlFor(readOnlyToken) {
  return `${window.location.origin}/view/${readOnlyToken}`;
}

export function inviteUrlFor(canvasId, inviteToken) {
  return `${window.location.origin}/invite/${canvasId}/${inviteToken}`;
}

export async function setPublicReadOnly(canvasId, enabled) {
  await updateDoc(doc(db, 'canvases', canvasId), { isPublicReadOnlyEnabled: !!enabled });
}
