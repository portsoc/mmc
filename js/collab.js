// WP04 — Yjs CRDT binding for conflict-free concurrent editing, plus
// awareness-based presence (focus halos, collaborator colors).
//
// Loaded from CDN as ES modules to keep the zero-bundler workflow intact.
// Swap the RTDB provider below for y-webrtc or y-websocket if latency or
// scale characteristics change.
import * as Y from 'https://esm.sh/yjs@13';
import { rtdb } from './firebase-config.js';
import { ref, onValue, onChildAdded, push, onDisconnect, set as rtdbSet } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js';
import { FIELD_IDS } from './canvas-data.js';
import { errorReporter } from './error-reporter.js';
import { applyTextDiff } from './text-diff.js';
import { applyItemsToY, itemsFromY, itemsKey, seedItemsUpdate, seedTextUpdate } from './yitems.js';

const PRESENCE_COLORS = ['#0076A6', '#621360', '#FF00FF', '#008148', '#B85C00'];

// While version history is showing an old version on the canvas, remote
// edits must not overwrite it; the history view re-renders live text on exit.
let domSyncPaused = false;
export function setDomSyncPaused(paused) {
  domSyncPaused = paused;
}

/** Overwrite whole fields in the shared doc (used by restore), so the change
 * reaches every peer and survives reload — Firestore alone is not enough,
 * because the Yjs history is what each client renders from. */
export function setFieldTexts(ydoc, yFields, fields, origin) {
  ydoc.transact(() => {
    for (const [fieldId, text] of Object.entries(fields)) {
      const ytext = yFields[fieldId];
      if (!ytext || ytext.toString() === (text || '')) continue;
      ytext.delete(0, ytext.length);
      ytext.insert(0, text || '');
    }
  }, origin);
}

/** Publish a section's rows (from the editor or a restore) to the shared doc. */
export function applyLocalItems(collab, fieldId, items) {
  const yarr = collab?.yItems?.[fieldId];
  if (yarr) applyItemsToY(Y, yarr, items, collab.provider._localOrigin);
}

export { itemsFromY };

export class FirebaseYjsProvider {
  constructor(canvasId, ydoc) {
    this.canvasId = canvasId;
    this.ydoc = ydoc;
    this.updatesRef = ref(rtdb, `sessions/${canvasId}/updates`);
    this.awarenessRef = ref(rtdb, `sessions/${canvasId}/awareness`);
    this._localOrigin = Symbol('local');
    // Resolves once the stored update history has been applied, so callers
    // can tell a genuinely empty doc from one that just hasn't loaded yet.
    this.synced = new Promise((resolve) => {
      this._resolveSynced = resolve;
      setTimeout(resolve, 2000);
    });
    this._bind();
  }

  _bind() {
    const appliedKeys = new Set();

    // Publish local Yjs updates to RTDB for other peers.
    // ONLY publish updates that originated from an active local user edit (_localOrigin)!
    this.ydoc.on('update', (update, origin) => {
      if (origin !== this._localOrigin) return;
      push(this.updatesRef, { clientId: this.ydoc.clientID, data: Array.from(update), ts: Date.now() })
        .catch((err) => {
          errorReporter.report('rtdb_push', err, { canvasId: this.canvasId });
        });
    });

    // Apply remote updates as they arrive. child_added delivers each update
    // once (the stored history on attach, then only new ones), rather than
    // re-sending the whole history to every client on every keystroke.
    this._remoteOrigin = Symbol('remote');
    const onError = (err) => {
      errorReporter.report('rtdb_stream', err, { canvasId: this.canvasId, path: 'updates' });
      this._resolveSynced();
    };
    onChildAdded(this.updatesRef, (child) => {
      if (appliedKeys.has(child.key)) return;
      appliedKeys.add(child.key);
      const val = child.val();
      if (!val || val.clientId === this.ydoc.clientID) return;
      Y.applyUpdate(this.ydoc, new Uint8Array(val.data), this._remoteOrigin);
    }, onError);
    // A value event fires after the initial child_added events for the same
    // location, from the same download, so it marks "history applied".
    onValue(this.updatesRef, () => this._resolveSynced(), onError, { onlyOnce: true });
  }

  setLocalAwareness(uid, state, immediate = true) {
    if (this._awarenessTimer) {
      clearTimeout(this._awarenessTimer);
      this._awarenessTimer = null;
    }

    const update = () => {
      this._lastAwarenessState = { ...state };
      const myRef = ref(rtdb, `sessions/${this.canvasId}/awareness/${uid}`);
      rtdbSet(myRef, { ...state, updatedAt: Date.now() })
        .catch((err) => {
          errorReporter.report('rtdb_awareness', err, { canvasId: this.canvasId, uid });
        });
      onDisconnect(myRef).remove().catch(() => {});
    };

    if (immediate) {
      update();
    } else {
      this._awarenessTimer = setTimeout(update, 80);
    }
  }

  clearLocalAwareness(uid) {
    if (this._awarenessTimer) {
      clearTimeout(this._awarenessTimer);
      this._awarenessTimer = null;
    }
    const myRef = ref(rtdb, `sessions/${this.canvasId}/awareness/${uid}`);
    rtdbSet(myRef, null).catch((err) => {
      errorReporter.report('rtdb_awareness_clear', err, { canvasId: this.canvasId, uid });
    });
  }

  onAwarenessChange(callback) {
    onValue(this.awarenessRef, (snapshot) => callback(snapshot.val() || {}), (err) => {
      errorReporter.report('rtdb_stream', err, { canvasId: this.canvasId, path: 'awareness' });
    });
  }
}

export function colorForUser(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

/**
 * Bind the header fields to Y.Texts and each section to a Y.Array of item
 * records, mirroring remote changes out through onRemoteUpdate(fieldId, value)
 * where value is a string for header fields and an item array for sections.
 */
export async function bindCollaborativeFields(canvasId, elementsById, canvasFields, canvasItems, onRemoteUpdate) {
  const ydoc = new Y.Doc();
  const provider = new FirebaseYjsProvider(canvasId, ydoc);
  const yFields = {};
  const yItems = {};

  // Await any stored history from active session
  await provider.synced;

  for (const fieldId of FIELD_IDS) {
    const el = elementsById[fieldId];
    if (!el) continue;

    if (['title', 'by'].includes(fieldId)) {
      const ytext = ydoc.getText(fieldId);
      yFields[fieldId] = ytext;
      // Seeds are published so later edits have their base on every peer;
      // the content-derived client id stops two simultaneous seeds doubling.
      if (ytext.toString() === '' && canvasFields?.[fieldId]) {
        Y.applyUpdate(ydoc, seedTextUpdate(Y, fieldId, canvasFields[fieldId]), provider._localOrigin);
      }
      if (ytext.toString() !== '') el.textContent = ytext.toString();
      el.addEventListener('input', () => {
        applyTextDiff(ytext, el.textContent || '', provider._localOrigin);
      });
      ytext.observe((event) => {
        if (domSyncPaused || event.transaction.origin !== provider._remoteOrigin) return;
        const remoteValue = ytext.toString();
        if (onRemoteUpdate) {
          onRemoteUpdate(fieldId, remoteValue);
        } else if (el.textContent !== remoteValue) {
          const caret = window.getSelection()?.focusOffset ?? 0;
          el.textContent = remoteValue;
          if (document.activeElement === el) placeCaret(el, Math.min(caret, remoteValue.length));
        }
      });
      continue;
    }

    const yarr = ydoc.getArray(itemsKey(fieldId));
    yItems[fieldId] = yarr;
    if (yarr.length === 0 && canvasItems?.[fieldId]?.length) {
      Y.applyUpdate(ydoc, seedItemsUpdate(Y, fieldId, canvasItems[fieldId]), provider._localOrigin);
    }
    yarr.observeDeep((events) => {
      if (domSyncPaused || events[0]?.transaction.origin !== provider._remoteOrigin) return;
      onRemoteUpdate?.(fieldId, itemsFromY(yarr));
    });
  }

  return { ydoc, provider, yFields, yItems };
}

function placeCaret(el, offset) {
  const range = document.createRange();
  const sel = window.getSelection();
  const node = el.firstChild || el;
  range.setStart(node, Math.min(offset, node.textContent?.length ?? 0));
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
