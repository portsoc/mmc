import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { SyncFeedbackManager, ToastManager } from '../../js/feedback.js';

describe('SyncFeedbackManager — Real-time Sync Status', () => {
  let manager;
  let mockEl;

  function createMockStatusElement() {
    return {
      className: '',
      innerHTML: '',
      attrs: {},
      listeners: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener(evt, fn) { this.listeners[evt] = fn; },
      click() { if (this.listeners.click) this.listeners.click(); }
    };
  }

  beforeEach(() => {
    mockEl = createMockStatusElement();
    manager = new SyncFeedbackManager({ autoInit: false });
    manager.bindElement(mockEl);
  });

  it('starts in synced state and renders appropriately', () => {
    assert.equal(manager.state, 'synced');
    assert.equal(mockEl.className, 'sync-status sync-synced');
    assert.equal(mockEl.getAttribute('data-state'), 'synced');
    assert.ok(mockEl.innerHTML.includes('Saved'));
  });

  it('transitions to saving state on startSave', () => {
    manager.startSave();
    assert.equal(manager.state, 'saving');
    assert.equal(manager.inFlightSaves, 1);
    assert.equal(mockEl.className, 'sync-status sync-saving');
    assert.ok(mockEl.innerHTML.includes('Saving…'));
  });

  it('handles multiple in-flight saves before returning to synced', () => {
    manager.startSave();
    manager.startSave();
    assert.equal(manager.inFlightSaves, 2);
    assert.equal(manager.state, 'saving');

    manager.finishSave();
    assert.equal(manager.inFlightSaves, 1);
    assert.equal(manager.state, 'saving');

    manager.finishSave();
    assert.equal(manager.inFlightSaves, 0);
    assert.equal(manager.state, 'synced');
    assert.equal(mockEl.className, 'sync-status sync-synced');
  });

  it('transitions to error state on failSave and captures error', () => {
    manager.startSave();
    const testErr = new Error('Transport dropped with status 400');
    manager.failSave(testErr);

    assert.equal(manager.state, 'error');
    assert.equal(manager.lastError, testErr);
    assert.equal(mockEl.className, 'sync-status sync-error');
    assert.ok(mockEl.innerHTML.includes('Sync error'));
    assert.ok(mockEl.getAttribute('title').includes('400'));
  });

  it('clears error and returns to synced', () => {
    manager.failSave(new Error('Connection failed'));
    assert.equal(manager.state, 'error');

    manager.clearError();
    assert.equal(manager.state, 'synced');
    assert.equal(manager.lastError, null);
    assert.equal(mockEl.className, 'sync-status sync-synced');
  });

  it('handles online and offline transitions', () => {
    manager.setOnline(false);
    assert.equal(manager.state, 'offline');
    assert.equal(mockEl.className, 'sync-status sync-offline');
    assert.ok(mockEl.innerHTML.includes('Offline'));

    manager.setOnline(true);
    assert.equal(manager.state, 'synced');
    assert.equal(mockEl.className, 'sync-status sync-synced');
  });

  it('triggers onStatusClick callback when status badge is clicked', () => {
    let clickedState = null;
    let clickedError = null;
    manager.onStatusClick = (state, err) => {
      clickedState = state;
      clickedError = err;
    };

    const err = new Error('Socket closed');
    manager.failSave(err);
    mockEl.click();

    assert.equal(clickedState, 'error');
    assert.equal(clickedError, err);
  });
});

describe('ToastManager — Accessible Notifications', () => {
  let mockContainer;
  let toastManager;

  function createMockElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      children: [],
      attrs: {},
      listeners: {},
      parentNode: null,
      textContent: '',
      innerHTML: '',
      appendChild(c) {
        c.parentNode = this;
        this.children.push(c);
      },
      removeChild(c) {
        const idx = this.children.indexOf(c);
        if (idx >= 0) this.children.splice(idx, 1);
        c.parentNode = null;
      },
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener(evt, fn) { this.listeners[evt] = fn; },
      click() { if (this.listeners.click) this.listeners.click({ stopPropagation: () => {} }); },
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); }
      }
    };
    return el;
  }

  beforeEach(() => {
    mockContainer = createMockElement('div');
    globalThis.document = {
      createElement: (tag) => createMockElement(tag),
      getElementById: (id) => (id === 'toast-container' ? mockContainer : null)
    };
    toastManager = new ToastManager(mockContainer);
  });

  afterEach(() => {
    delete globalThis.document;
  });

  it('renders an accessible error toast with message', () => {
    toastManager.error('Failed to sync canvas document', { duration: 0 });
    assert.equal(mockContainer.children.length, 1);

    const toast = mockContainer.children[0];
    assert.equal(toast.className, 'toast-card toast-error');
    assert.equal(toast.getAttribute('role'), 'alert');
    assert.ok(toast.children.some((c) => c.textContent === 'Failed to sync canvas document'));
  });

  it('supports interactive action button with callback', () => {
    let actionTriggered = false;
    toastManager.warning('Connection lost', {
      duration: 0,
      action: {
        label: 'Retry',
        onClick: () => { actionTriggered = true; }
      }
    });

    const toast = mockContainer.children[0];
    const actionBtn = toast.children.find((c) => c.className === 'toast-action-btn');
    assert.ok(actionBtn);
    assert.equal(actionBtn.textContent, 'Retry');

    actionBtn.click();
    assert.equal(actionTriggered, true);
  });

  it('dismisses toast on close button click', () => {
    const { dismiss } = toastManager.info('Saved successfully', { duration: 0 });
    const toast = mockContainer.children[0];
    assert.ok(toast);

    const closeBtn = toast.children.find((c) => c.className === 'toast-close-btn');
    assert.ok(closeBtn);
    closeBtn.click();
    assert.ok(toast.classList.contains('toast-dismissing'));
  });
});
