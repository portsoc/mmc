// WP-J2 — MCP endpoint so AI tools (Claude Code, Claude Desktop, other MCP
// clients) can read canvases. Stateless Streamable HTTP: each POST carries one
// JSON-RPC message (or a batch) and gets a JSON reply; there is no SSE stream.
//
// Callers authenticate with a personal token from Settings (see api-tokens.js):
//   Authorization: Bearer mmc_…
// A token acts as its owner, so it sees exactly the canvases they can.
const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { verifyApiToken } = require('./api-tokens');

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'mission-model-canvas', version: '1.0.0' };

// What each section is for, so a model can interpret (and later write) content sensibly.
const SECTIONS = [
  ['kp', 'Key Partners', 'Organisations and people the mission must work with: other agencies, contractors, suppliers, collaborators.'],
  ['ka', 'Key Activities', 'The most important things the team must do to deliver the value propositions.'],
  ['vp', 'Value Propositions', 'What the mission delivers to its beneficiaries and why it matters to them.'],
  ['bs', 'Buy-in Support', 'Who must approve, fund or support the mission, and how that buy-in is won.'],
  ['be', 'Beneficiaries', 'Who the mission serves and what they need.'],
  ['kr', 'Key Resources', 'People, assets, knowledge and funding the mission depends on.'],
  ['de', 'Deployment', 'What it takes to put the solution into the hands of beneficiaries.'],
  ['mb', 'Mission Budget/Cost', 'The main costs of running the mission.'],
  ['if', 'Mission Achievement/Impact Factors', 'How success is measured: the outcomes and impact that show the mission worked.']
];

const INSTRUCTIONS =
  'Mission Model Canvas (MMC): a one-page plan for a mission-driven project, in nine sections ' +
  '(the mission version of the Business Model Canvas, by Steve Blank). Use list_canvases to find ' +
  'a canvas, then get_canvas to read it. Items in different sections that share a link group ' +
  'were deliberately linked by the author, e.g. a beneficiary and the value proposition that serves them.';

const TOOLS = [
  {
    name: 'list_canvases',
    title: 'List canvases',
    description: 'List the Mission Model Canvases you can access (owned or shared with you), most recently edited first.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'get_canvas',
    title: 'Read a canvas',
    description:
      'Read one Mission Model Canvas: its title, author and nine sections. Each section lists its items ' +
      '(one per line in the editor) with text, bullet, colour and link group. Linked items across sections ' +
      'are also summarised in "links". Text reflects edits saved up to a few seconds ago.',
    inputSchema: {
      type: 'object',
      properties: { canvasId: { type: 'string', description: 'Canvas id from list_canvases.' } },
      required: ['canvasId'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  }
];

class ToolError extends Error {}

function iso(ts) {
  return ts?.toDate ? ts.toDate().toISOString() : null;
}

function roleOf(canvas, uid) {
  return canvas?.roles?.[uid] || null;
}

/** A canvas the uid may read, or null. Binned canvases are visible to their owner only. */
function readable(canvas, uid) {
  const role = roleOf(canvas, uid);
  if (!role) return null;
  if (canvas.binnedAt && role !== 'owner') return null;
  return role;
}

function sectionItems(canvas, id) {
  const items = canvas.items?.[id];
  if (Array.isArray(items)) {
    return items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: item.id || '',
        text: typeof item.text === 'string' ? item.text : '',
        bullet: item.bullet || '',
        colour: item.color || '',
        link: item.assocId || ''
      }));
  }
  // Canvases not yet opened since items were introduced only have plain text.
  const text = typeof canvas.fields?.[id] === 'string' ? canvas.fields[id] : '';
  return text ? text.split('\n').map((line, i) => ({ id: `${id}-${i}`, text: line, bullet: '', colour: '', link: '' })) : [];
}

function describeCanvas(id, canvas, uid) {
  const sections = SECTIONS.map(([sid, name, purpose]) => ({
    id: sid,
    name,
    purpose,
    items: sectionItems(canvas, sid)
  }));

  const groups = new Map();
  for (const section of sections) {
    for (const item of section.items) {
      if (!item.link) continue;
      if (!groups.has(item.link)) groups.set(item.link, []);
      groups.get(item.link).push({ section: section.name, itemId: item.id, text: item.text });
    }
  }
  const links = [...groups].filter(([, members]) => members.length > 1).map(([group, items]) => ({ group, items }));

  return {
    canvasId: id,
    title: canvas.fields?.title || canvas.title || '',
    author: canvas.fields?.by || '',
    yourRole: roleOf(canvas, uid),
    binned: Boolean(canvas.binnedAt),
    updatedAt: iso(canvas.updatedAt),
    collaborators: Object.entries(canvas.roles || {}).map(([cuid, role]) => ({
      name: canvas.memberNames?.[cuid] || 'Unnamed collaborator',
      role
    })),
    sections,
    links
  };
}

async function listCanvases(db, uid) {
  const snap = await db.collection('canvases').where(`roles.${uid}`, 'in', ['owner', 'editor', 'viewer']).get();
  const canvases = snap.docs
    .filter((doc) => !doc.get('binnedAt'))
    .map((doc) => {
      const c = doc.data();
      const filled = SECTIONS.filter(([sid]) => sectionItems(c, sid).some((item) => item.text.trim())).length;
      return {
        canvasId: doc.id,
        title: c.fields?.title || c.title || '',
        author: c.fields?.by || '',
        yourRole: roleOf(c, uid),
        updatedAt: iso(c.updatedAt),
        sectionsWithContent: filled
      };
    });
  canvases.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return { canvases };
}

async function getCanvas(db, uid, args) {
  const canvasId = typeof args?.canvasId === 'string' ? args.canvasId.trim() : '';
  if (!canvasId || canvasId.includes('/')) throw new ToolError('canvasId is required.');
  const snap = await db.doc(`canvases/${canvasId}`).get();
  // Same answer for "missing" and "not yours", so ids can't be probed.
  if (!snap.exists || !readable(snap.data(), uid)) throw new ToolError(`No canvas ${canvasId} that you can access.`);
  return describeCanvas(snap.id, snap.data(), uid);
}

const TOOL_HANDLERS = { list_canvases: listCanvases, get_canvas: getCanvas };

/** Handle one JSON-RPC message for an authenticated uid. Returns a response, or null for notifications. */
async function handleMessage(msg, { db, uid }) {
  const isRequest = msg && typeof msg === 'object' && msg.jsonrpc === '2.0' && typeof msg.method === 'string';
  const id = msg?.id ?? null;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  if (!isRequest) return fail(-32600, 'Invalid request');
  if (msg.id === undefined) return null; // notification, e.g. notifications/initialized

  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return reply({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const handler = TOOL_HANDLERS[msg.params?.name];
      if (!handler) return fail(-32602, `Unknown tool: ${msg.params?.name}`);
      try {
        const result = await handler(db, uid, msg.params.arguments || {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result });
      } catch (err) {
        if (!(err instanceof ToolError)) throw err;
        return reply({ content: [{ type: 'text', text: err.message }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

/** HTTP handler, separated from onRequest so tests can inject db and token checking. */
function createMcpHandler({ getDb, verify }) {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST').status(405).json({ error: 'This MCP server accepts POST only (no SSE stream).' });
      return;
    }

    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const uid = await verify(token);
    if (!uid) {
      res.set('WWW-Authenticate', 'Bearer realm="mmc"').status(401)
        .json({ error: 'Missing or invalid token. Create one in MMC → Settings → AI connectors.' });
      return;
    }

    const body = req.body;
    const batch = Array.isArray(body);
    const messages = batch ? body : [body];
    const ctx = { db: getDb(), uid };
    try {
      const replies = (await Promise.all(messages.map((m) => handleMessage(m, ctx)))).filter(Boolean);
      if (!replies.length) {
        res.status(202).end();
        return;
      }
      res.status(200).json(batch ? replies : replies[0]);
    } catch (err) {
      console.error('mcp request failed', err);
      res.status(500).json({ jsonrpc: '2.0', id: batch ? null : body?.id ?? null, error: { code: -32603, message: 'Internal error' } });
    }
  };
}

exports.mcp = onRequest({ cors: false }, createMcpHandler({ getDb: getFirestore, verify: verifyApiToken }));

exports.createMcpHandler = createMcpHandler;
exports.handleMessage = handleMessage;
exports.describeCanvas = describeCanvas;
