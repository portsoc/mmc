// item-migration.js — Normalization and migration engine for Canvas Items.
// Transforms legacy plain text, markdown lists, bracketed links, and historical
// canvas formats into structured CanvasItem objects:
// { id, text, bullet, color, bg, fg, assocId }

export const DEFAULT_BULLET = '⚫';

export const DEFAULT_BULLET_STYLES = {
  '🟢': { bg: '#D1FAE5', fg: '#047857', color: 'emerald' },
  '🟣': { bg: '#EDE9FE', fg: '#6D28D9', color: 'violet' },
  '🔵': { bg: '#E0F2FE', fg: '#0369A1', color: 'azure' },
  '🔴': { bg: '#FFE4E6', fg: '#BE123C', color: 'coral' },
  '🟠': { bg: '#FEF3C7', fg: '#B45309', color: 'amber' },
  '🟡': { bg: '#FEF3C7', fg: '#B45309', color: 'amber' },
  '⚫': { bg: 'transparent', fg: 'inherit', color: 'clear' }
};

export const CANVAS_SECTIONS = ['kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if'];

export function generateItemId(sectionId = 'item') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `i_${sectionId}_${rand}`;
}

export function generateAssocId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `assoc_${rand}`;
}

/**
 * Parses any legacy or raw line into a structured CanvasItem.
 * Handles:
 * 1. Leading emoji bullet (e.g. "⚫ text", "🟢 text")
 * 2. Markdown / standard list prefixes (e.g. "- text", "* text", "• text")
 * 3. Bracket / tagged link identifiers (e.g. "[1] text", "[team-a] text")
 * 4. Plain unbulleted text
 */
export function parseLegacyLine(rawLine, sectionId = 'item') {
  if (rawLine === null || rawLine === undefined) {
    return {
      id: generateItemId(sectionId),
      text: '',
      bullet: DEFAULT_BULLET,
      color: '',
      assocId: ''
    };
  }

  let str = String(rawLine).trim();
  if (!str) {
    return {
      id: generateItemId(sectionId),
      text: '',
      bullet: DEFAULT_BULLET,
      color: '',
      assocId: ''
    };
  }

  let assocId = '';
  let bullet = DEFAULT_BULLET;
  let color = '';

  // Check for legacy bracketed association token (e.g. "[1] ", "[a] ", "[tag-name] ")
  const bracketMatch = str.match(/^\[([\w-]+)\]\s*(.*)$/);
  if (bracketMatch) {
    assocId = bracketMatch[1];
    str = bracketMatch[2].trim();
  }

  // Check for leading emoji or standard bullet symbols
  const emojiRegex = /^(\p{Extended_Pictographic}\uFE0F?|\p{Emoji_Presentation}|[⚫⚪▪▫◼◻◆◇])\s*(.*)$/u;
  const emojiMatch = str.match(emojiRegex);

  if (emojiMatch) {
    bullet = emojiMatch[1];
    str = emojiMatch[2].trim();
    if (DEFAULT_BULLET_STYLES[bullet]?.color && DEFAULT_BULLET_STYLES[bullet].color !== 'clear') {
      color = DEFAULT_BULLET_STYLES[bullet].color;
    }
  } else {
    // Check for standard markdown / plain list markers (-, *, •)
    const listPrefixMatch = str.match(/^[-*•]\s+(.*)$/);
    if (listPrefixMatch) {
      bullet = DEFAULT_BULLET;
      str = listPrefixMatch[1].trim();
    }
  }

  return {
    id: generateItemId(sectionId),
    text: str,
    bullet,
    color,
    assocId
  };
}

/**
 * Normalizes raw section content into a validated CanvasItem array.
 * Accepts:
 * - Existing CanvasItem array: validates IDs and properties
 * - Plain string / markdown with newlines
 * - Empty / null / undefined
 */
export function normalizeSection(rawSection, sectionId = 'item') {
  if (!rawSection) {
    return [];
  }

  // Already an array of items: ensure required properties and stable IDs
  if (Array.isArray(rawSection)) {
    return rawSection
      .filter((item) => item && (typeof item === 'object' || typeof item === 'string'))
      .map((item) => {
        if (typeof item === 'string') {
          return parseLegacyLine(item, sectionId);
        }
        const bullet = item.bullet || DEFAULT_BULLET;
        let color = item.color || '';
        let bg = item.bg || '';
        let fg = item.fg || '';
        // Sanitize accidental azure default on unstyled or default-bullet items
        if (bullet === DEFAULT_BULLET && color === 'azure') {
          color = '';
          bg = '';
          fg = '';
        }
        return {
          id: item.id || generateItemId(sectionId),
          text: typeof item.text === 'string' ? item.text : '',
          bullet,
          color,
          bg,
          fg,
          assocId: item.assocId || ''
        };
      });
  }

  // String: split by newlines and parse each non-empty line
  if (typeof rawSection === 'string') {
    const lines = rawSection.split(/\r?\n/);
    const items = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      items.push(parseLegacyLine(line, sectionId));
    }
    return items;
  }

  return [];
}

/**
 * Serializes an array of CanvasItems into a clean plain text / Markdown representation.
 */
export function itemsToPlainText(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .filter((item) => item && (item.text || item.bullet))
    .map((item) => {
      const b = item.bullet || DEFAULT_BULLET;
      const t = item.text || '';
      return t ? `${b} ${t}` : b;
    })
    .join('\n');
}

/**
 * The line format shared through the live Yjs text. Like itemsToPlainText, but
 * a linked item keeps its link as a leading "[assocId] " tag, which
 * parseLegacyLine reads back, so links reach collaborators and survive reload.
 */
export function syncLine(bullet, text, assocId) {
  const b = bullet || DEFAULT_BULLET;
  const line = text ? `${b} ${text}` : b;
  return assocId ? `[${assocId}] ${line}` : line;
}

export function itemsToSyncText(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .filter((item) => item && (item.text || item.bullet))
    .map((item) => syncLine(item.bullet, item.text, item.assocId))
    .join('\n');
}

/**
 * Normalizes an entire canvas document. Ensures both `items` and `fields` are
 * fully populated and in sync.
 */
export function normalizeCanvas(canvasData) {
  if (!canvasData || typeof canvasData !== 'object') {
    return {
      title: '',
      by: '',
      items: Object.fromEntries(CANVAS_SECTIONS.map((s) => [s, []])),
      fields: Object.fromEntries(['title', 'by', ...CANVAS_SECTIONS].map((s) => [s, '']))
    };
  }

  const outItems = {};
  const outFields = {
    title: canvasData.title || canvasData.fields?.title || '',
    by: canvasData.by || canvasData.fields?.by || ''
  };

  const sourceItems = canvasData.items || {};
  const sourceFields = canvasData.fields || {};

  for (const sectionId of CANVAS_SECTIONS) {
    if (Array.isArray(sourceItems[sectionId]) && sourceItems[sectionId].length > 0) {
      outItems[sectionId] = normalizeSection(sourceItems[sectionId], sectionId);
      outFields[sectionId] = itemsToPlainText(outItems[sectionId]);
    } else if (sourceFields[sectionId]) {
      outItems[sectionId] = normalizeSection(sourceFields[sectionId], sectionId);
      outFields[sectionId] = sourceFields[sectionId];
    } else {
      outItems[sectionId] = [];
      outFields[sectionId] = '';
    }
  }

  // Auto-group items sharing non-default bullets across sections if they lack assocId
  const bulletGroups = new Map();
  for (const sectionId of CANVAS_SECTIONS) {
    for (const item of outItems[sectionId]) {
      if (item && item.bullet && item.bullet !== DEFAULT_BULLET) {
        if (!bulletGroups.has(item.bullet)) {
          bulletGroups.set(item.bullet, []);
        }
        bulletGroups.get(item.bullet).push(item);
      }
    }
  }

  for (const items of bulletGroups.values()) {
    if (items.length > 1) {
      let sharedAssocId = items.find((it) => it.assocId)?.assocId;
      if (!sharedAssocId) {
        sharedAssocId = generateAssocId();
      }
      const styledItem = items.find((it) => it.color || it.bg);
      for (const item of items) {
        if (!item.assocId) {
          item.assocId = sharedAssocId;
        }
        if (styledItem) {
          if (!item.color && styledItem.color) item.color = styledItem.color;
          if (!item.bg && styledItem.bg) item.bg = styledItem.bg;
          if (!item.fg && styledItem.fg) item.fg = styledItem.fg;
        }
      }
    }
  }

  return {
    ...canvasData,
    title: outFields.title,
    by: outFields.by,
    items: outItems,
    fields: outFields
  };
}
