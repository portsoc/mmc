// Feedback Module — Real-time Sync Status indicator and accessible Toast notifications.
// Designed with zero dependencies and adhering to Portsmouth MMC design rules.

function getNavigatorOnline() {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

export class SyncFeedbackManager {
  constructor(options = {}) {
    this.statusEl = null;
    this.inFlightSaves = 0;
    this.pendingEdits = false; // edited, but the save hasn't started yet
    this.isOnline = getNavigatorOnline();
    this.isRtdbConnected = true;
    this.lastError = null;
    this.onStatusClick = options.onStatusClick || null;

    if (options.autoInit !== false && typeof window !== 'undefined') {
      this.initNetworkListeners();
    }
  }

  // Derived from the facts every time, so it can't claim "Saved" while
  // edits are waiting or the live connection is down.
  // 'synced' | 'saving' | 'reconnecting' | 'offline' | 'error'
  get state() {
    if (!this.isOnline) return 'offline';
    if (this.lastError) return 'error';
    if (!this.isRtdbConnected) return 'reconnecting';
    if (this.pendingEdits || this.inFlightSaves > 0) return 'saving';
    return 'synced';
  }

  bindElement(el) {
    this.statusEl = el;
    if (this.statusEl) {
      this.statusEl.addEventListener('click', () => {
        if (this.onStatusClick) {
          this.onStatusClick(this.state, this.lastError);
        }
      });
      this.render();
    }
  }

  initNetworkListeners() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.setOnline(true));
    window.addEventListener('offline', () => this.setOnline(false));
  }

  setOnline(online) {
    this.isOnline = Boolean(online);
    this.render();
  }

  setRtdbConnected(connected) {
    this.isRtdbConnected = Boolean(connected);
    this.render();
  }

  markPending() {
    this.pendingEdits = true;
    this.render();
  }

  startSave() {
    this.pendingEdits = false;
    this.inFlightSaves += 1;
    this.lastError = null;
    this.render();
  }

  finishSave() {
    this.inFlightSaves = Math.max(0, this.inFlightSaves - 1);
    this.render();
  }

  failSave(error) {
    this.inFlightSaves = Math.max(0, this.inFlightSaves - 1);
    this.lastError = error;
    this.render();
  }

  clearError() {
    this.lastError = null;
    this.render();
  }

  render() {
    if (!this.statusEl) return;

    const state = this.state;
    this.statusEl.className = `sync-status sync-${state}`;
    this.statusEl.setAttribute('data-state', state);

    let html = '';
    let title = '';

    switch (state) {
      case 'saving':
        html = `<span class="sync-dot saving" aria-hidden="true"></span><span class="sync-label">Saving…</span>`;
        title = 'Saving your changes…';
        break;
      case 'offline':
        html = `<svg class="sync-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M1 1l22 22M16.5 16.5H5a4 4 0 0 1 0-8c.4 0 .8.1 1.2.2a6 6 0 0 1 10.3 2.3M19.4 14.5A4.5 4.5 0 0 0 19 9a5 5 0 0 0-4-2.8"/></svg><span class="sync-label">Offline</span>`;
        title = 'You are offline. Your edits will sync when you reconnect — keep this tab open until then.';
        break;
      case 'reconnecting':
        html = `<span class="sync-dot saving" aria-hidden="true"></span><span class="sync-label">Reconnecting…</span>`;
        title = 'Lost the live connection. Your edits will sync when it comes back — keep this tab open.';
        break;
      case 'error':
        html = `<svg class="sync-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 8v4m0 4v.01M10.3 2.8l-8.6 15A2 2 0 0 0 3.4 21h17.2a2 2 0 0 0 1.7-3.2l-8.6-15a2 2 0 0 0-3.4 0z"/></svg><span class="sync-label">Sync error</span>`;
        title = `Sync error: ${this.lastError?.message || 'Click for diagnostics and retry'}`;
        break;
      case 'synced':
      default:
        html = `<span class="sync-dot synced" aria-hidden="true"></span><span class="sync-label">Saved</span>`;
        title = 'All changes saved to cloud.';
        break;
    }

    this.statusEl.innerHTML = html;
    this.statusEl.setAttribute('title', title);
  }
}

export class ToastManager {
  constructor(containerEl = null) {
    this.container = containerEl;
  }

  setContainer(containerEl) {
    this.container = containerEl;
  }

  show({ message, type = 'info', duration = 4000, action = null }) {
    if (!this.container && typeof document !== 'undefined') {
      this.container = document.getElementById('toast-container');
    }
    if (!this.container || typeof document === 'undefined') {
      return { dismiss: () => {} };
    }

    const toast = document.createElement('div');
    toast.className = `toast-card toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-message';
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    if (action && action.label && action.onClick) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast-action-btn';
      actionBtn.textContent = action.label;
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          action.onClick();
        } finally {
          dismiss();
        }
      });
      toast.appendChild(actionBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });
    toast.appendChild(closeBtn);

    let dismissed = false;
    let timer = null;

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      if (timer) clearTimeout(timer);
      toast.classList.add('toast-dismissing');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    };

    if (duration > 0) {
      timer = setTimeout(dismiss, duration);
    }

    this.container.appendChild(toast);
    return { dismiss };
  }

  info(message, opts = {}) {
    return this.show({ message, type: 'info', ...opts });
  }

  success(message, opts = {}) {
    return this.show({ message, type: 'success', ...opts });
  }

  warning(message, opts = {}) {
    return this.show({ message, type: 'warning', ...opts });
  }

  error(message, opts = {}) {
    return this.show({ message, type: 'error', duration: opts.duration ?? 8000, ...opts });
  }
}

export const syncFeedback = new SyncFeedbackManager();
export const toastManager = new ToastManager();
