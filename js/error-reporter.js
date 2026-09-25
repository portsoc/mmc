// ErrorReporter — Centralized error listening, deduplication, sessionStorage ring buffer,
// and diagnostic reporting.
// Designed to run in both browser and headless test environments with zero dependencies.

const MAX_LOG_SIZE = 50;
const DEDUP_WINDOW_MS = 10000; // 10 seconds
const STORAGE_KEY = 'mmc_error_log';

function getNavigatorOnline() {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

export class ErrorReporter {
  constructor(options = {}) {
    this.maxLogSize = options.maxLogSize || MAX_LOG_SIZE;
    this.dedupWindowMs = options.dedupWindowMs || DEDUP_WINDOW_MS;
    this.remoteReporter = options.remoteReporter || null;
    this.canvasId = null;
    this.uid = null;
    this.listeners = new Set();
    this.logs = this._loadLogs();
    this._remoteThrottles = new Map();

    if (options.autoInit !== false && typeof window !== 'undefined') {
      this.initGlobalListeners();
    }
  }

  setContext({ canvasId, uid } = {}) {
    if (canvasId !== undefined) this.canvasId = canvasId;
    if (uid !== undefined) this.uid = uid;
  }

  addListener(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify(entry) {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (err) {
        console.warn('[ErrorReporter] Listener error:', err);
      }
    }
  }

  initGlobalListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      this.report('window_error', event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.report('unhandledrejection', event.reason || 'Unhandled Promise Rejection');
    });
  }

  sanitizeMessage(msg) {
    if (!msg) return 'Unknown error';
    let str = typeof msg === 'string' ? msg : (msg.message || String(msg));
    // Sanitize any URL query parameters (which may contain gsessionid, tokens, keys)
    str = str.replace(/([?&][a-zA-Z0-9_-]+)=([^&\s]+)/g, '$1=[REDACTED]');
    return str;
  }

  report(type, errorOrMessage, extraContext = {}) {
    const rawMessage = typeof errorOrMessage === 'string' ? errorOrMessage : (errorOrMessage?.message || String(errorOrMessage));
    const message = this.sanitizeMessage(rawMessage);
    const stack = errorOrMessage?.stack ? this._sanitizeStack(errorOrMessage.stack) : undefined;
    const now = Date.now();
    const isOnline = getNavigatorOnline();
    const userAgent = typeof navigator !== 'undefined' ? (navigator.userAgent || 'Unknown') : 'Unknown';

    // Deduplication check: same type and message within DEDUP_WINDOW_MS
    const existing = this.logs.find(
      (entry) => entry.type === type && entry.message === message && (now - entry.lastSeen) < this.dedupWindowMs
    );

    let entry;
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
      existing.online = isOnline;
      if (this.canvasId && !existing.canvasId) existing.canvasId = this.canvasId;
      if (this.uid && !existing.uid) existing.uid = this.uid;
      entry = existing;
    } else {
      entry = {
        id: `err_${now}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now,
        lastSeen: now,
        count: 1,
        type,
        message,
        stack,
        canvasId: this.canvasId,
        uid: this.uid,
        online: isOnline,
        userAgent,
        ...extraContext
      };
      this.logs.unshift(entry);
      if (this.logs.length > this.maxLogSize) {
        this.logs.length = this.maxLogSize;
      }
    }

    this._saveLogs();
    this._notify(entry);
    this._dispatchRemote(entry);

    return entry;
  }

  _sanitizeStack(stack) {
    if (typeof stack !== 'string') return '';
    // Strip sensitive URL parameters from stack traces
    return stack.replace(/([?&][a-zA-Z0-9_-]+)=([^&\s)]+)/g, '$1=[REDACTED]');
  }

  _loadLogs() {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        }
      }
    } catch {
      // sessionStorage unavailable
    }
    return [];
  }

  _saveLogs() {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
      }
    } catch {
      // sessionStorage full or disabled
    }
  }

  clearLogs() {
    this.logs = [];
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
  }

  getLogs() {
    return [...this.logs];
  }

  async _dispatchRemote(entry) {
    if (!this.remoteReporter || !getNavigatorOnline()) {
      return;
    }

    // Rate-limit remote calls for the same error signature to once per 60 seconds
    const throttleKey = `${entry.type}:${entry.message}`;
    const lastSent = this._remoteThrottles.get(throttleKey) || 0;
    if (Date.now() - lastSent < 60000) return;
    this._remoteThrottles.set(throttleKey, Date.now());

    try {
      await this.remoteReporter({
        type: entry.type,
        message: entry.message,
        stack: entry.stack,
        canvasId: entry.canvasId,
        uid: entry.uid,
        online: entry.online,
        count: entry.count,
        timestamp: entry.timestamp,
        userAgent: entry.userAgent
      });
    } catch (err) {
      // Suppress remote reporting failures so we don't cause infinite error loops
      console.warn('[ErrorReporter] Failed to send error telemetry remotely:', err);
    }
  }

  formatDiagnostics() {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : 'Unknown';
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
    const href = typeof window !== 'undefined' ? this.sanitizeMessage(window.location.href) : 'N/A';
    const timestamp = new Date().toISOString();

    let output = `# MMC Diagnostic Report\n`;
    output += `Generated: ${timestamp}\n`;
    output += `Online: ${isOnline}\n`;
    output += `Current URL: ${href}\n`;
    output += `Active Canvas ID: ${this.canvasId || 'None'}\n`;
    output += `Active User: ${this.uid ? 'Signed In' : 'Anonymous/None'}\n`;
    output += `User Agent: ${ua}\n\n`;

    output += `## Recent Errors (${this.logs.length})\n`;
    if (this.logs.length === 0) {
      output += `No errors recorded in this session.\n`;
    } else {
      this.logs.forEach((err, idx) => {
        const timeStr = new Date(err.timestamp).toLocaleTimeString();
        output += `### ${idx + 1}. [${err.type.toUpperCase()}] ${err.message}\n`;
        output += `- Time: ${timeStr} (Count: ${err.count})\n`;
        output += `- Online: ${err.online}\n`;
        if (err.stack) {
          output += `\`\`\`\n${err.stack.trim()}\n\`\`\`\n`;
        }
      });
    }

    return output;
  }
}

// Global default instance for the application
export const errorReporter = new ErrorReporter();
