import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createMcpHandler } = require('../../functions/mcp.js');

// Minimal Firestore stand-in: canvases keyed by id, supporting the two reads mcp.js makes.
function fakeDb(canvases) {
  const docSnap = (id) => ({
    id,
    exists: id in canvases,
    data: () => canvases[id],
    get: (field) => canvases[id]?.[field]
  });
  return {
    doc: (path) => ({ get: async () => docSnap(path.split('/')[1]) }),
    collection: () => ({
      where: (field, op, roles) => ({
        get: async () => {
          const uid = field.split('.')[1];
          const ids = Object.keys(canvases).filter((id) => roles.includes(canvases[id].roles?.[uid]));
          return { docs: ids.map(docSnap) };
        }
      })
    })
  };
}

const ts = (iso) => ({ toDate: () => new Date(iso) });

const CANVASES = {
  mine: {
    roles: { alice: 'owner', bob: 'editor' },
    memberNames: { alice: 'Alice', bob: 'Bob' },
    fields: { title: 'Clean rivers', by: 'Alice' },
    updatedAt: ts('2026-05-02T10:00:00Z'),
    items: {
      be: [{ id: 'b1', text: 'Anglers', bullet: '🟢', color: 'emerald', assocId: 'L1' }],
      vp: [{ id: 'v1', text: 'Fish come back', bullet: '⚫', color: '', assocId: 'L1' }, { id: 'v2', text: 'Cleaner water' }]
    }
  },
  older: { roles: { alice: 'viewer' }, fields: { title: 'Old plan', kp: 'Council\nCharity' }, updatedAt: ts('2026-01-01T00:00:00Z') },
  binned: { roles: { alice: 'editor', carol: 'owner' }, fields: { title: 'Gone' }, binnedAt: ts('2026-04-01T00:00:00Z') },
  strangers: { roles: { carol: 'owner' }, fields: { title: 'Secret' } }
};

async function call(body, { token = 'good', method = 'POST' } = {}) {
  const handler = createMcpHandler({
    getDb: () => fakeDb(CANVASES),
    verify: async (t) => (t === 'good' ? 'alice' : null)
  });
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  await handler({ method, body, get: (h) => (h.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : '') }, res);
  return res;
}

const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const tool = async (name, args) => (await call(rpc('tools/call', { name, arguments: args }))).body.result;

describe('MCP endpoint', () => {
  it('rejects requests without a valid token', async () => {
    const res = await call(rpc('tools/list'), { token: 'bad' });
    assert.equal(res.statusCode, 401);
    assert.match(res.headers['WWW-Authenticate'], /Bearer/);
  });

  it('accepts POST only', async () => {
    assert.equal((await call(undefined, { method: 'GET' })).statusCode, 405);
  });

  it('initializes, echoing a supported protocol version', async () => {
    const { result } = (await call(rpc('initialize', { protocolVersion: '2025-03-26' }))).body;
    assert.equal(result.protocolVersion, '2025-03-26');
    assert.ok(result.capabilities.tools);
  });

  it('answers notifications with 202 and no body', async () => {
    const res = await call({ jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(res.statusCode, 202);
    assert.equal(res.body, undefined);
  });

  it('lists read-only tools', async () => {
    const { tools } = (await call(rpc('tools/list'))).body.result;
    assert.deepEqual(tools.map((t) => t.name), ['list_canvases', 'get_canvas']);
    assert.ok(tools.every((t) => t.annotations.readOnlyHint));
  });

  it('lists only accessible, unbinned canvases, newest first', async () => {
    const { structuredContent } = await tool('list_canvases', {});
    assert.deepEqual(structuredContent.canvases.map((c) => c.canvasId), ['mine', 'older']);
    assert.equal(structuredContent.canvases[0].sectionsWithContent, 2);
  });

  it('reads a canvas with sections, purposes, links and collaborator names', async () => {
    const { structuredContent: c } = await tool('get_canvas', { canvasId: 'mine' });
    assert.equal(c.title, 'Clean rivers');
    assert.equal(c.sections.length, 9);
    const vp = c.sections.find((s) => s.id === 'vp');
    assert.ok(vp.purpose);
    assert.deepEqual(vp.items.map((i) => i.text), ['Fish come back', 'Cleaner water']);
    assert.deepEqual(c.links, [{ group: 'L1', items: [
      { section: 'Value Propositions', itemId: 'v1', text: 'Fish come back' },
      { section: 'Beneficiaries', itemId: 'b1', text: 'Anglers' }
    ] }]);
    assert.deepEqual(c.collaborators.map((p) => p.name), ['Alice', 'Bob']);
  });

  it('falls back to plain text for canvases without items', async () => {
    const { structuredContent: c } = await tool('get_canvas', { canvasId: 'older' });
    assert.deepEqual(c.sections.find((s) => s.id === 'kp').items.map((i) => i.text), ['Council', 'Charity']);
  });

  it('refuses canvases you cannot access, the same way as missing ones', async () => {
    for (const canvasId of ['strangers', 'binned', 'nope']) {
      const result = await tool('get_canvas', { canvasId });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /No canvas .* that you can access/);
    }
  });

  it('reports unknown methods and tools as JSON-RPC errors', async () => {
    assert.equal((await call(rpc('resources/list'))).body.error.code, -32601);
    assert.equal((await call(rpc('tools/call', { name: 'delete_everything' }))).body.error.code, -32602);
  });
});
