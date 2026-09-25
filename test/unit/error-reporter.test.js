import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorReporter } from '../../js/error-reporter.js';

describe('ErrorReporter — Centralized Error Telemetry', () => {
  let reporter;
  let mockStorage;

  beforeEach(() => {
    mockStorage = new Map();
    globalThis.sessionStorage = {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k)
    };
    reporter = new ErrorReporter({ autoInit: false, maxLogSize: 5, dedupWindowMs: 1000 });
  });

  test('reports errors and formats structured entries', () => {
    const entry = reporter.report('firestore_write', new Error('Permission denied on canvases/c_123'));
    assert.equal(entry.type, 'firestore_write');
    assert.equal(entry.message, 'Permission denied on canvases/c_123');
    assert.equal(entry.count, 1);
    assert.ok(entry.timestamp > 0);
    assert.equal(reporter.getLogs().length, 1);
  });

  test('sanitizes sensitive query parameters in error messages and stack traces', () => {
    const rawUrlError = 'Failed to load https://firestore.googleapis.com/Listen/channel?gsessionid=SECRET123&AID=99';
    const entry = reporter.report('firestore_stream', rawUrlError);
    assert.ok(!entry.message.includes('SECRET123'));
    assert.ok(entry.message.includes('gsessionid=[REDACTED]'));
    assert.ok(entry.message.includes('AID=[REDACTED]'));
  });

  test('deduplicates identical errors within dedupWindowMs', () => {
    const msg = 'WebChannel transport connection error';
    const e1 = reporter.report('transport_drop', msg);
    const e2 = reporter.report('transport_drop', msg);
    const e3 = reporter.report('transport_drop', msg);

    assert.equal(e1.id, e2.id);
    assert.equal(e2.id, e3.id);
    assert.equal(e3.count, 3);
    assert.equal(reporter.getLogs().length, 1);
  });

  test('records separate entries for different error messages or types', () => {
    reporter.report('firestore', 'Doc not found');
    reporter.report('firestore', 'Quota exceeded');
    reporter.report('auth', 'Token expired');

    const logs = reporter.getLogs();
    assert.equal(logs.length, 3);
    assert.equal(logs[0].message, 'Token expired'); // newest first
    assert.equal(logs[1].message, 'Quota exceeded');
    assert.equal(logs[2].message, 'Doc not found');
  });

  test('enforces maxLogSize ring buffer', () => {
    for (let i = 1; i <= 8; i++) {
      reporter.report('test_type', `Error number ${i}`);
    }
    const logs = reporter.getLogs();
    assert.equal(logs.length, 5); // maxLogSize was set to 5 in beforeEach
    assert.equal(logs[0].message, 'Error number 8');
    assert.equal(logs[4].message, 'Error number 4');
  });

  test('notifies registered listeners on new errors', () => {
    const captured = [];
    const unsubscribe = reporter.addListener((entry) => captured.push(entry));

    reporter.report('test', 'Listener notification test');
    assert.equal(captured.length, 1);
    assert.equal(captured[0].message, 'Listener notification test');

    unsubscribe();
    reporter.report('test', 'Should not capture');
    assert.equal(captured.length, 1);
  });

  test('persists and clears logs via sessionStorage', () => {
    reporter.report('test', 'Persisted error');
    assert.ok(mockStorage.get('mmc_error_log'));

    reporter.clearLogs();
    assert.equal(reporter.getLogs().length, 0);
    assert.equal(mockStorage.get('mmc_error_log'), undefined);
  });

  test('formatDiagnostics generates markdown report with metadata and log details', () => {
    reporter.setContext({ canvasId: 'canvas_abc', uid: 'user_xyz' });
    reporter.report('firestore', 'Permission denied');

    const markdown = reporter.formatDiagnostics();
    assert.ok(markdown.includes('# MMC Diagnostic Report'));
    assert.ok(markdown.includes('canvas_abc'));
    assert.ok(markdown.includes('Active User: Signed In'));
    assert.ok(markdown.includes('[FIRESTORE] Permission denied'));
  });

  test('dispatches to remoteReporter with rate limiting', async () => {
    const sent = [];
    reporter.remoteReporter = async (payload) => sent.push(payload);

    await reporter.report('network', 'Server 500 drop');
    await reporter.report('network', 'Server 500 drop'); // Throttled

    assert.equal(sent.length, 1);
    assert.equal(sent[0].message, 'Server 500 drop');
  });
});
