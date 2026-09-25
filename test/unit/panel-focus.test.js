import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { PanelFocusManager, CANVAS_PANELS } from '../../js/panel-focus.js';

describe('PanelFocusManager — Canvas Focus & Collaborative Presence', () => {
  let mockGridEls;
  let broadcastEvents;
  let manager;

  function createMockGridElement(id) {
    const classList = new Set();
    const styleProps = {};
    const mockH2 = {
      tag: 'h2',
      children: [],
      querySelector(sel) {
        if (sel === '.panel-collab-tags') return this.children.find((c) => c.className === 'panel-collab-tags') || null;
        if (sel === 'img') return { tag: 'img' };
        return null;
      },
      appendChild(child) {
        this.children.push(child);
      },
      insertBefore(child, ref) {
        this.children.push(child);
      }
    };

    const mockLi = {
      tag: 'li',
      dataset: { id: `item_${id}_1` },
      classList: new Set(),
      attrs: {},
      style: {
        props: {},
        setProperty(k, v) { this.props[k] = v; },
        removeProperty(k) { delete this.props[k]; }
      },
      setAttribute(k, v) { this.attrs[k] = v; },
      removeAttribute(k) { delete this.attrs[k]; }
    };
    mockLi.classList.add = function (c) { Set.prototype.add.call(mockLi.classList, c); };
    mockLi.classList.remove = function (c) { Set.prototype.delete.call(mockLi.classList, c); };
    mockLi.classList.contains = function (c) { return Set.prototype.has.call(mockLi.classList, c); };

    const mockSection = {
      tag: 'section',
      className: 'e',
      id: `e${id}`,
      querySelector(sel) {
        if (sel === `li[data-id="item_${id}_1"]` || sel === 'li') return mockLi;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '.canvas-list li') return [mockLi];
        return [];
      }
    };

    return {
      id,
      classList: {
        has: (c) => classList.has(c),
        add: (c) => classList.add(c),
        remove: (c) => classList.delete(c),
        toggle: (c, force) => (force ? classList.add(c) : classList.delete(c)),
        contains: (c) => classList.has(c)
      },
      querySelector(sel) {
        if (sel === 'h2') return mockH2;
        if (sel === '.e') return mockSection;
        return null;
      },
      _mockH2: mockH2,
      _mockLi: mockLi
    };
  }

  beforeEach(() => {
    mockGridEls = {};
    for (const pid of CANVAS_PANELS) {
      mockGridEls[pid] = createMockGridElement(pid);
    }
    broadcastEvents = [];
    manager = new PanelFocusManager(mockGridEls, (evt) => {
      broadcastEvents.push(evt);
    });
    manager.setMyUid('user_local');
  });

  it('CANVAS_PANELS contains standard 9 mission canvas sections', () => {
    assert.deepEqual(CANVAS_PANELS, ['kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if']);
  });

  it('1. Idle state: all 9 panels are 100% visible when local user is editing NO panels', () => {
    const { isEditingAny, activeSet } = manager.getActivePanels();
    assert.equal(isEditingAny, false);
    assert.equal(activeSet.size, 9);
    for (const pid of CANVAS_PANELS) {
      assert.ok(activeSet.has(pid));
    }

    manager.applyFocusState();
    for (const pid of CANVAS_PANELS) {
      assert.equal(mockGridEls[pid].classList.contains('panel-dimmed'), false);
      assert.equal(mockGridEls[pid].classList.contains('panel-local-focus'), false);
    }
  });

  it('2. Local editing state: when editing a panel, it is 100% visible and other panels are dimmed to 50%', () => {
    manager.setLocalFocus('kp', 'item_kp_1', 3, true);

    const { isEditingAny, activeSet } = manager.getActivePanels();
    assert.equal(isEditingAny, true);
    assert.equal(activeSet.size, 1);
    assert.ok(activeSet.has('kp'));

    assert.equal(mockGridEls.kp.classList.contains('panel-dimmed'), false);
    assert.equal(mockGridEls.kp.classList.contains('panel-active'), true);
    assert.equal(mockGridEls.kp.classList.contains('panel-local-focus'), true);

    // All other 8 panels are dimmed
    for (const pid of CANVAS_PANELS) {
      if (pid === 'kp') continue;
      assert.equal(mockGridEls[pid].classList.contains('panel-dimmed'), true);
      assert.equal(mockGridEls[pid].classList.contains('panel-active'), false);
    }

    // Broadcast was triggered
    assert.equal(broadcastEvents.length, 1);
    assert.deepEqual(broadcastEvents[0], {
      panelId: 'kp',
      itemId: 'item_kp_1',
      itemIndex: null,
      offset: 3,
      immediate: true
    });
  });

  it('3. Remote collaborators: panels edited by remote collaborators remain 100% visible while others are 50%', () => {
    // Remote collaborator 'user_b' is editing 'vp'
    manager.updateRemoteAwareness({
      user_b: {
        name: 'Alice',
        color: '#FF00FF',
        panelId: 'vp',
        itemId: 'item_vp_1',
        updatedAt: Date.now()
      }
    });

    // Local user starts editing 'kp'
    manager.setLocalFocus('kp', 'item_kp_1', 0, true);

    const { isEditingAny, activeSet } = manager.getActivePanels();
    assert.equal(isEditingAny, true);
    assert.equal(activeSet.size, 2);
    assert.ok(activeSet.has('kp'));
    assert.ok(activeSet.has('vp'));

    // Both 'kp' (local) and 'vp' (remote) are 100% visible (not dimmed)
    assert.equal(mockGridEls.kp.classList.contains('panel-dimmed'), false);
    assert.equal(mockGridEls.kp.classList.contains('panel-active'), true);
    assert.equal(mockGridEls.vp.classList.contains('panel-dimmed'), false);
    assert.equal(mockGridEls.vp.classList.contains('panel-active'), true);

    // Other 7 panels are dimmed to 50%
    for (const pid of ['ka', 'bs', 'be', 'kr', 'de', 'mb', 'if']) {
      assert.equal(mockGridEls[pid].classList.contains('panel-dimmed'), true);
    }
  });

  it('4. Blurring restores all panels to 100% opacity even if remote collaborators are active', () => {
    // Remote collaborator is on 'vp'
    manager.updateRemoteAwareness({
      user_b: {
        name: 'Alice',
        color: '#FF00FF',
        panelId: 'vp',
        updatedAt: Date.now()
      }
    });

    // Local user edits 'kp'
    manager.setLocalFocus('kp', 'item_kp_1', 0, true);
    assert.equal(mockGridEls.ka.classList.contains('panel-dimmed'), true);

    // Local user blurs / hits Escape
    manager.setLocalFocus(null);

    const { isEditingAny, activeSet } = manager.getActivePanels();
    assert.equal(isEditingAny, false);
    assert.equal(activeSet.size, 9);

    // All panels are 100% opacity (no panel-dimmed anywhere)
    for (const pid of CANVAS_PANELS) {
      assert.equal(mockGridEls[pid].classList.contains('panel-dimmed'), false);
    }

    // Remote panel still retains remote-editing flag for icon blooming
    assert.equal(mockGridEls.vp.classList.contains('remote-editing'), true);
  });

  it('5. Stale remote collaborators (>30s) are ignored', () => {
    manager.updateRemoteAwareness({
      user_b: {
        name: 'Alice',
        color: '#FF00FF',
        panelId: 'vp',
        updatedAt: Date.now() - 35000 // 35 seconds ago
      }
    });

    manager.setLocalFocus('kp', 'item_kp_1', 0, true);
    const { activeSet } = manager.getActivePanels();

    // Only 'kp' is active; stale 'vp' is not kept at 100%
    assert.equal(activeSet.size, 1);
    assert.ok(activeSet.has('kp'));
    assert.ok(!activeSet.has('vp'));
  });

  it('6. Typing/offset updates do not force immediate broadcast if panel and item are unchanged', () => {
    manager.setLocalFocus('kp', 'item_kp_1', 0, true);
    assert.equal(broadcastEvents.length, 1);
    assert.equal(broadcastEvents[0].immediate, true);

    // Typing changes offset with immediate = false
    manager.setLocalFocus('kp', 'item_kp_1', 5, false);
    assert.equal(broadcastEvents.length, 2);
    assert.equal(broadcastEvents[1].immediate, false);
    assert.equal(broadcastEvents[1].offset, 5);
  });

  it('7. Remote presence rendering sets attributes without child DOM inside <li>', () => {
    // Setup document mock for renderRemotePresence
    globalThis.document = {
      querySelectorAll(sel) {
        if (sel === '.remote-cursor-active' || sel === '.panel-collab-tag') return [];
        return [];
      },
      createElement(tag) {
        return {
          tag,
          className: '',
          style: {},
          textContent: '',
          title: '',
          children: [],
          appendChild(child) { this.children.push(child); }
        };
      }
    };

    manager.updateRemoteAwareness({
      user_b: {
        name: 'Sarah',
        color: '#10B981',
        panelId: 'kp',
        itemId: 'item_kp_1',
        updatedAt: Date.now()
      }
    });

    const targetLi = mockGridEls.kp._mockLi;
    assert.equal(targetLi.classList.contains('remote-cursor-active'), true);
    assert.equal(targetLi.attrs['data-collab-user'], 'Sarah');
    assert.equal(targetLi.style.props['--remote-user-color'], '#10B981');

    // Crucial invariant: zero child DOM inserted into <li>
    assert.equal(targetLi.children, undefined);

    delete globalThis.document;
  });
});
