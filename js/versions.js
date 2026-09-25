// WP05 — Manual waypoints + client-side lazy daily snapshot fallback
// (Pattern B from the WP; Pattern A lives in functions/snapshots.js for
// projects on the Blaze plan).
import { db } from './firebase-config.js';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { FIELD_IDS, getCanvas } from './canvas-data.js';
import { isOwner } from './roles.js';
import { firstName } from './auth.js';
import { ensureBullets } from './ragged-links.js';
import { normalizeCanvas, normalizeSection } from './item-migration.js';

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function wordCount(fields) {
  return Object.values(fields).reduce((sum, text) => sum + (text?.trim() ? text.trim().split(/\s+/).length : 0), 0);
}

async function writeVersion(canvasId, fields, { type, name, description, createdBy }, items = null) {
  const id = `v_${todayKey().replace(/-/g, '')}_${Date.now().toString().slice(-6)}`;
  const normalized = normalizeCanvas({ fields, items });
  await setDoc(doc(db, 'canvases', canvasId, 'versions', id), {
    id,
    canvasId,
    name,
    description: description || '',
    type,
    dateKey: todayKey(),
    createdAt: serverTimestamp(),
    createdBy,
    fields: { ...normalized.fields },
    items: normalized.items,
    wordCountTotal: wordCount(normalized.fields),
    stats: {
      sectionsFilled: FIELD_IDS.filter((f) => normalized.fields[f]?.trim()).length
    }
  });
  return id;
}

export async function createWaypoint(canvasId, name, description, user) {
  const canvas = await getCanvas(canvasId);
  if (!canvas) throw new Error('Canvas not found');
  return writeVersion(canvasId, canvas.fields, {
    type: 'manual',
    name,
    description,
    createdBy: { uid: user.uid, name: firstName(user) }
  }, canvas.items);
}

/** Call on canvas load; no-ops unless a day has passed with content present. */
export async function maybeCreateDailySnapshot(canvasId, user) {
  const canvas = await getCanvas(canvasId);
  if (!canvas) return null;
  const today = todayKey();
  if (canvas.lastSnapshotDate === today) return null;

  const hasContent = FIELD_IDS.some((f) => canvas.fields[f]?.trim());
  if (!hasContent) return null;

  const id = await writeVersion(canvasId, canvas.fields, {
    type: 'daily_auto',
    name: `Daily Snapshot: ${today}`,
    createdBy: { uid: user.uid, name: firstName(user) }
  }, canvas.items);

  await updateDoc(doc(db, 'canvases', canvasId), { lastSnapshotDate: today });
  return id;
}

export async function listVersions(canvasId) {
  const q = query(collection(db, 'canvases', canvasId, 'versions'), orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

/** Owner-only: overwrite live canvas fields with a past version's fields,
 * logging an audit record (an own manual version of the pre-restore state,
 * so the overwritten content is itself recoverable). */
export async function restoreVersion(canvasId, versionId, user) {
  const canvas = await getCanvas(canvasId);
  if (!canvas) throw new Error('Canvas not found');
  if (!isOwner(canvas, user.uid)) throw new Error('Only the canvas owner can restore a version');

  const versionRef = doc(db, 'canvases', canvasId, 'versions', versionId);
  const versionSnap = await getDoc(versionRef);
  if (!versionSnap.exists()) throw new Error('Version not found');
  const version = versionSnap.data();

  await writeVersion(canvasId, canvas.fields, {
    type: 'manual',
    name: `Before restoring "${version.name}"`,
    description: `Auto-saved audit record prior to restore of ${versionId}.`,
    createdBy: { uid: user.uid, name: firstName(user) }
  }, canvas.items);

  // Ensure older plain text versions have bullets added to all 9 operational canvas sections
  const restoredFields = { ...canvas.fields, ...version.fields };
  for (const fieldId of ['kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if']) {
    if (restoredFields[fieldId] !== undefined) {
      restoredFields[fieldId] = ensureBullets(restoredFields[fieldId]);
    }
  }

  const restoredItems = { ...(canvas.items || {}) };
  for (const fieldId of ['kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if']) {
    if (version.items?.[fieldId]) {
      restoredItems[fieldId] = version.items[fieldId];
    } else if (restoredFields[fieldId] !== undefined) {
      restoredItems[fieldId] = normalizeSection(restoredFields[fieldId], fieldId);
    }
  }

  // Merge so fields added since the version was taken (e.g. title) survive.
  await updateDoc(doc(db, 'canvases', canvasId), {
    fields: restoredFields,
    items: restoredItems,
    updatedAt: serverTimestamp()
  });
  return { ...version, fields: restoredFields, items: restoredItems };
}
