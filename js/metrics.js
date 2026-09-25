// WP06 — Lightweight client-side contribution attribution. Batches edits
// (debounced) rather than writing to Firestore on every keystroke, to keep
// typing latency unaffected.
import { db } from './firebase-config.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { colorForUser } from './collab.js';

const DEBOUNCE_MS = 4000;
const pendingDeltas = new Map(); // fieldId -> { uid, charsDelta }
let flushTimer = null;

function metricsRef(canvasId) {
  return doc(db, 'canvases', canvasId, 'metrics', 'contributions');
}

export function recordEdit(canvasId, fieldId, uid, displayName, charsDelta) {
  const key = `${fieldId}:${uid}`;
  const existing = pendingDeltas.get(key) || { canvasId, fieldId, uid, displayName, charsDelta: 0, edits: 0 };
  existing.charsDelta += charsDelta;
  existing.edits += 1;
  pendingDeltas.set(key, existing);

  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, DEBOUNCE_MS);
}

async function flush() {
  const deltas = Array.from(pendingDeltas.values());
  pendingDeltas.clear();
  if (deltas.length === 0) return;

  const canvasId = deltas[0].canvasId;
  const ref = metricsRef(canvasId);
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : { totalWords: 0, totalEdits: 0, contributors: {}, fieldAttribution: {} };

  for (const { fieldId, uid, displayName, charsDelta, edits } of deltas) {
    const words = Math.round(Math.abs(charsDelta) / 5); // rough heuristic
    const contributor = current.contributors[uid] || {
      name: displayName,
      avatarColor: colorForUser(uid),
      wordsContributed: 0,
      editCount: 0,
      sectionsEdited: []
    };
    contributor.wordsContributed += words;
    contributor.editCount += edits;
    if (!contributor.sectionsEdited.includes(fieldId)) contributor.sectionsEdited.push(fieldId);
    current.contributors[uid] = contributor;

    current.fieldAttribution[fieldId] = current.fieldAttribution[fieldId] || {};
    current.fieldAttribution[fieldId][uid] = (current.fieldAttribution[fieldId][uid] || 0) + words;

    current.totalEdits += edits;
  }

  current.totalWords = Object.values(current.contributors).reduce((s, c) => s + c.wordsContributed, 0);
  const total = current.totalWords || 1;
  for (const c of Object.values(current.contributors)) {
    c.percentage = Math.round((c.wordsContributed / total) * 1000) / 10;
  }
  current.lastUpdated = serverTimestamp();

  await setDoc(ref, current);
}

export async function getContributionMetrics(canvasId) {
  const snap = await getDoc(metricsRef(canvasId));
  return snap.exists() ? snap.data() : null;
}
