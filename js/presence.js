// Who else is here, and where their cursors are: the avatar row in the
// toolbar, plus publishing this user's panel/line/offset as awareness state.
import { currentUser, onUser, firstName } from './auth.js';
import { colorForUser } from './collab.js';
import { PanelFocusManager, CANVAS_PANELS } from './panel-focus.js';
import { state } from './app-state.js';

function renderPresence(awarenessState) {
  const container = document.getElementById('presence-avatars');
  if (!container) return;
  container.innerHTML = '';
  for (const [uid, info] of Object.entries(awarenessState || {})) {
    const pill = document.createElement('div');
    pill.className = 'presence-avatar';
    pill.style.background = colorForUser(uid);
    pill.title = info.name || 'Collaborator';
    pill.textContent = (info.name || '?').slice(0, 1).toUpperCase();
    container.appendChild(pill);
  }
}

export function initPanelFocus() {
  if (state.panelFocus) return;

  const gridEls = {};
  for (const pid of CANVAS_PANELS) {
    gridEls[pid] = document.getElementById(pid);
  }

  state.panelFocus = new PanelFocusManager(gridEls, ({ panelId, itemId, itemIndex, offset, immediate }) => {
    if (state.collab?.provider && currentUser.value) {
      state.collab.provider.setLocalAwareness(currentUser.value.uid, {
        name: firstName(currentUser.value),
        color: colorForUser(currentUser.value.uid),
        panelId,
        itemId,
        itemIndex,
        offset
      }, immediate);
    }
  });

  if (currentUser.value) {
    state.panelFocus.setMyUid(currentUser.value.uid);
  }

  const getTargetPanelId = (el) => {
    if (!el || el === document.body) return null;
    const gridItem = el.closest?.('.grid-item');
    if (gridItem && CANVAS_PANELS.includes(gridItem.id)) return gridItem.id;
    const sec = el.closest?.('.e');
    if (sec && sec.id?.startsWith('e')) {
      const pid = sec.id.slice(1);
      if (CANVAS_PANELS.includes(pid)) return pid;
    }
    return null;
  };

  const getActiveItemInfo = (target) => {
    const li = target?.closest?.('li');
    const itemId = li?.dataset?.id || null;
    let itemIndex = null;
    if (li && li.parentElement) {
      itemIndex = Array.prototype.indexOf.call(li.parentElement.children, li);
    }
    const sel = window.getSelection?.();
    const offset = sel ? sel.focusOffset : 0;
    return { itemId, itemIndex: itemIndex >= 0 ? itemIndex : null, offset };
  };

  // Focus event: entering an editable element
  document.addEventListener('focusin', (e) => {
    const panelId = getTargetPanelId(e.target);
    if (panelId) {
      const { itemId, itemIndex, offset } = getActiveItemInfo(e.target);
      state.panelFocus.setLocalFocus(panelId, itemId, offset, true, itemIndex);
    } else {
      state.panelFocus.setLocalFocus(null);
    }
  });

  // Focusout event: leaving an element
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const active = document.activeElement;
      const panelId = getTargetPanelId(active);
      if (!panelId) {
        state.panelFocus.setLocalFocus(null);
      }
    }, 10);
  });

  // Track cursor and typing position within active panel
  const handleCursorMove = (immediate = false) => {
    if (!state.panelFocus?.localPanelId) return;
    const sel = window.getSelection?.();
    if (!sel || !sel.anchorNode) return;
    const node = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
    const panelId = getTargetPanelId(node);
    if (panelId === state.panelFocus.localPanelId) {
      const { itemId, itemIndex, offset } = getActiveItemInfo(node);
      state.panelFocus.setLocalFocus(panelId, itemId, offset, immediate, itemIndex);
    }
  };

  document.addEventListener('selectionchange', () => handleCursorMove(false));
  document.addEventListener('input', () => handleCursorMove(false));

  // Focus modal closing
  document.getElementById('focus-modal')?.addEventListener('close', () => {
    state.panelFocus?.setLocalFocus(null);
  });
}

/** Publishes this user's awareness on the live session's provider and
 * renders everyone else's (avatars + remote cursors). */
export function wirePresence(provider) {
  onUser((user) => {
    if (!user) {
      if (currentUser.value) {
        provider.clearLocalAwareness(currentUser.value.uid);
      }
      return;
    }
    state.panelFocus?.setMyUid(user.uid);
    provider.setLocalAwareness(user.uid, {
      name: firstName(user),
      color: colorForUser(user.uid),
      panelId: state.panelFocus?.localPanelId || null,
      itemId: state.panelFocus?.localItemId || null,
      itemIndex: state.panelFocus?.localItemIndex || null,
      offset: state.panelFocus?.localOffset || 0
    }, true);
  });
  provider.onAwarenessChange((awareness) => {
    renderPresence(awareness);
    state.panelFocus?.updateRemoteAwareness(awareness);
  });
}
