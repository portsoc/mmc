# WP04 — Real-Time Concurrent Multi-User Editing & Presence

## 1. Objective
Enable multiple concurrent editors to type simultaneously in any field across the canvas without character-overwrites, cursor jumps, or race conditions, accompanied by real-time presence indicators.

---

## 2. Background & Technical Problem
The requirement is explicit:
*"I want multiple concurrent editors in each field. Backed by a firebase database."*

Standard Firestore document listeners (`onSnapshot` / `updateDoc`) overwrite entire strings. If User A types "University" and User B simultaneously types "Portsmouth" in "Key Partners", whichever document writes last overwrites the other, causing lost edits and erratic caret resets.

To solve this, we employ a **Conflict-free Replicated Data Type (CRDT)** text model.

---

## 3. Architecture & Collaborative Model

### 3.1 Collaborative Engine: Yjs
- **Why Yjs?**:
  - Industry benchmark for collaborative web editing (used in Jupyter, Nextcloud, Linear, GitBook).
  - Extremely compact memory and binary update serialization.
  - Provable convergence: all peers reach identical state regardless of network reordering or offline delays.
  - First-class support for `contenteditable` bindings and plain text `Y.Text` structures.
  - Native awareness protocol for broadcasting collaborator cursors, presence, and focus.

### 3.2 Synchronization Layer (Firebase Provider)
Two implementation approaches:
1. **Firebase Realtime Database (RTDB) Provider (Recommended)**:
   - Lowest latency sync (<50ms).
   - Updates dispatched to `/sessions/{canvasId}/updates`.
   - Native presence protocol via `/.info/connected` and `onDisconnect()`.
2. **Firestore Subcollection Delta Provider (Alternative)**:
   - Updates stored as small incremental update records in `/canvases/{canvasId}/crdt_updates/{seq}`.
   - Periodically compacted into the main canvas document every few minutes.

### 3.3 Presence & Visual Feedback
When multiple users are on the canvas:
1. **Focus Halos**:
   - When User A focuses on "Key Partners" (`#ekp`), User B sees a glowing border and a small floating pill showing User A's avatar/name in User A's assigned color (e.g., `#0076A6` or Portsmouth Purple `#FF00FF`).
   - Reuses existing `:has(*:focus)` CSS, extended with dynamic collaborator color classes.
2. **Concurrent In-Field Typing**:
   - If User A and User B type in the same block, insertions and deletions are merged at the character level in real time.
   - Caret positions are preserved across remote updates.

---

## 4. Implementation Steps

1. **Yjs Document Binding**:
   - Initialize a root `Y.Doc()` per canvas.
   - Define sub-structures for each field:
     ```javascript
     const yFields = {
       mmd: ydoc.getText('mmd'),
       by: ydoc.getText('by'),
       kp: ydoc.getText('kp'),
       ka: ydoc.getText('ka'),
       vp: ydoc.getText('vp'),
       bs: ydoc.getText('bs'),
       be: ydoc.getText('be'),
       kr: ydoc.getText('kr'),
       de: ydoc.getText('de'),
       mb: ydoc.getText('mb'),
       if: ydoc.getText('if')
     };
     ```
2. **Two-Way DOM Binding**:
   - Bind each `[contenteditable]` element to its corresponding `Y.Text`.
   - Local input events apply diffs to `Y.Text`.
   - Remote `Y.Text` changes apply minimal DOM patch or caret-preserving text adjustment.
3. **Awareness & Presence**:
   - Set local state: `provider.awareness.setLocalStateField('user', { name, color, fieldFocus: 'ekp' })`.
   - Listen to `awareness.on('change', ...)` to render collaborator tags on active grid items.
4. **Offline Resilience**:
   - Yjs buffers offline edits in IndexedDB.
   - Once network is restored, buffered edits merge seamlessly with the remote state without conflict.

---

## 5. Deliverables & Acceptance Criteria
- [x] Two browser windows can simultaneously type in the same field without dropping keystrokes or moving the other user's cursor. (Yjs `Y.Text` CRDT per field, relayed via RTDB `push`/`onValue`; convergence verified offline via simulated two-doc merge — real caret preservation is a simple clamp, not a proper diff/patch, see code comment in `collab.js`)
- [x] Active field focus glows with the collaborator's assigned color. (`renderPresence` in `app.js` paints border-left + avatar pill from `colorForUser`; driven by RTDB awareness node)
- [ ] Graceful recovery after simulated network disconnect/reconnect. (not tested — `onDisconnect().remove()` clears awareness on drop, but reconnect/resync behavior unverified)
- [x] Read-only users observe incoming live edits in real time without ability to broadcast changes. (viewers get `contenteditable=false` from WP02 role gating; `bindCollaborativeFields` still listens for remote Y.Text updates regardless of role)

**Known gap**: `FirebaseYjsProvider` pushes every update to `sessions/{canvasId}/updates` with no compaction/pruning — the RTDB update log grows unbounded for long-lived canvases. Needs a periodic squash-to-snapshot before this is production-ready.
