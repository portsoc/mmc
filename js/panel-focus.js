// panel-focus.js — Dynamic Canvas Panel Focus & Collaborative Presence Manager
// Synchronizes panel opacity (50% / 100%) and collaborator cursors in real time.
//
// Rules:
// 1. When local user is editing NO panels: all panels are 100% visible.
// 2. When local user IS editing a panel: that panel is 100% visible, non-active panels are 50% opacity.
// 3. Any panel being edited by remote collaborators also remains at 100% opacity.
// 4. Non-intrusive collaborator cursors: row outlines & CSS pseudo-element name tags (zero child DOM).

export const CANVAS_PANELS = ['kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if'];

export class PanelFocusManager {
  constructor(gridElementsById = {}, onFocusBroadcast = null) {
    this.gridElementsById = gridElementsById;
    this.onFocusBroadcast = onFocusBroadcast;
    this.localPanelId = null;
    this.localItemId = null;
    this.localItemIndex = null;
    this.localOffset = 0;
    this.latestAwareness = {};
    this.myUid = null;
  }

  setMyUid(uid) {
    this.myUid = uid;
  }

  /**
   * Called when local focus changes inside or outside canvas panels.
   */
  setLocalFocus(panelId, itemId = null, offset = 0, immediate = true, itemIndex = null) {
    const validPanel = CANVAS_PANELS.includes(panelId) ? panelId : null;
    const panelChanged = this.localPanelId !== validPanel;
    const itemChanged = this.localItemId !== itemId;
    const indexChanged = this.localItemIndex !== itemIndex;
    const offsetChanged = this.localOffset !== offset;

    if (!panelChanged && !itemChanged && !indexChanged && !offsetChanged) {
      return;
    }

    this.localPanelId = validPanel;
    this.localItemId = itemId;
    this.localItemIndex = itemIndex;
    this.localOffset = offset;

    this.applyFocusState();

    if (this.onFocusBroadcast) {
      this.onFocusBroadcast({
        panelId: this.localPanelId,
        itemId: this.localItemId,
        itemIndex: this.localItemIndex,
        offset: this.localOffset,
        immediate: immediate || panelChanged || itemChanged
      });
    }
  }

  /**
   * Called when remote collaborator awareness states update from RTDB.
   */
  updateRemoteAwareness(awarenessState) {
    this.latestAwareness = awarenessState || {};
    this.applyFocusState();
    this.renderRemotePresence();
  }

  /**
   * Computes which panels should be active (100% opacity) vs dimmed (50% opacity).
   */
  getActivePanels() {
    const now = Date.now();
    const remoteActive = new Set();

    for (const [uid, info] of Object.entries(this.latestAwareness)) {
      if (this.myUid && uid === this.myUid) continue;
      if (!info || !info.panelId || !CANVAS_PANELS.includes(info.panelId)) continue;
      // Stale check (30 seconds)
      if (info.updatedAt && now - info.updatedAt > 30000) continue;
      remoteActive.add(info.panelId);
    }

    // Rule: When local user is editing NO panels, ALL panels are fully visible (100% opacity).
    if (!this.localPanelId) {
      return {
        isEditingAny: false,
        activeSet: new Set(CANVAS_PANELS),
        remoteActive
      };
    }

    // Rule: When local user IS editing, local panel + any remote active panels are 100% opacity.
    const activeSet = new Set();
    activeSet.add(this.localPanelId);
    for (const p of remoteActive) {
      activeSet.add(p);
    }

    return {
      isEditingAny: true,
      activeSet,
      remoteActive
    };
  }

  /**
   * Applies .panel-dimmed (opacity: 0.5) and .panel-active to all 9 grid items.
   */
  applyFocusState() {
    const { isEditingAny, activeSet, remoteActive } = this.getActivePanels();

    for (const panelId of CANVAS_PANELS) {
      const el = this.gridElementsById[panelId] || (typeof document !== 'undefined' ? document.getElementById(panelId) : null);
      if (!el) continue;

      const isActive = activeSet.has(panelId);
      const isLocal = this.localPanelId === panelId;
      const isRemote = remoteActive.has(panelId);

      if (!isEditingAny) {
        // Idle: all panels at 100% opacity
        el.classList.remove('panel-dimmed');
        el.classList.remove('panel-local-focus');
        el.classList.toggle('remote-editing', isRemote);
      } else if (isActive) {
        // Active panel: 100% opacity
        el.classList.remove('panel-dimmed');
        el.classList.add('panel-active');
        el.classList.toggle('panel-local-focus', isLocal);
        el.classList.toggle('remote-editing', isRemote);
      } else {
        // Dimmed panel: 50% opacity
        el.classList.add('panel-dimmed');
        el.classList.remove('panel-active', 'panel-local-focus', 'remote-editing');
      }
    }
  }

  /**
   * Renders non-intrusive remote cursor halos and header badges.
   */
  renderRemotePresence() {
    if (typeof document === 'undefined') return;

    // Clear prior remote cursor tags and outlines
    document.querySelectorAll('.remote-cursor-active').forEach((li) => {
      li.classList.remove('remote-cursor-active');
      li.removeAttribute('data-collab-user');
      li.style.removeProperty('--remote-user-color');
    });

    document.querySelectorAll('.panel-collab-tag').forEach((tag) => tag.remove());

    const now = Date.now();
    for (const [uid, info] of Object.entries(this.latestAwareness)) {
      if (this.myUid && uid === this.myUid) continue;
      if (!info || !info.panelId || !CANVAS_PANELS.includes(info.panelId)) continue;
      if (info.updatedAt && now - info.updatedAt > 30000) continue;

      const panelEl = this.gridElementsById[info.panelId] || document.getElementById(info.panelId);
      if (!panelEl) continue;

      const userColor = info.color || '#7C3AED';
      const userName = info.name || 'Collaborator';

      // 1. Add header collaborator badge on the panel
      const h2 = panelEl.querySelector('h2');
      if (h2) {
        let tagContainer = h2.querySelector('.panel-collab-tags');
        if (!tagContainer) {
          tagContainer = document.createElement('span');
          tagContainer.className = 'panel-collab-tags';
          const icon = h2.querySelector('img');
          if (icon && h2.insertBefore) {
            h2.insertBefore(tagContainer, icon);
          } else {
            h2.appendChild(tagContainer);
          }
        }
        const badge = document.createElement('span');
        badge.className = 'panel-collab-tag';
        badge.style.backgroundColor = userColor;
        badge.textContent = userName;
        badge.title = `${userName} is editing here`;
        tagContainer.appendChild(badge);
      }

      // 2. Highlight remote item if itemId or itemIndex is provided
      const sec = panelEl.querySelector('.e');
      if (sec) {
        let targetLi = null;
        if (info.itemId) {
          targetLi = sec.querySelector(`li[data-id="${info.itemId}"]`);
        }
        if (!targetLi && typeof info.itemIndex === 'number') {
          const allLis = sec.querySelectorAll('.canvas-list li');
          targetLi = allLis[info.itemIndex] || null;
        }

        if (targetLi) {
          targetLi.classList.add('remote-cursor-active');
          targetLi.setAttribute('data-collab-user', userName);
          targetLi.style.setProperty('--remote-user-color', userColor);
        }
      }
    }
  }
}
