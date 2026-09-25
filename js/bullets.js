// bullets.js — bullet palette/presets and plain-text line parsing (no DOM).

export const DEFAULT_BULLET = '⚫';

export const BULLET_PALETTE = [
  { id: 'emerald', name: 'Emerald', bg: '#D1FAE5', fg: '#047857', darkBg: '#064E3B', darkFg: '#6EE7B7' },
  { id: 'violet',  name: 'Violet',  bg: '#EDE9FE', fg: '#6D28D9', darkBg: '#4C1D95', darkFg: '#C4B5FD' },
  { id: 'azure',   name: 'Azure',   bg: '#E0F2FE', fg: '#0369A1', darkBg: '#0C4A6E', darkFg: '#7DD3FC' },
  { id: 'coral',   name: 'Coral',   bg: '#FFE4E6', fg: '#BE123C', darkBg: '#881337', darkFg: '#FDA4AF' },
  { id: 'amber',   name: 'Amber',   bg: '#FEF3C7', fg: '#B45309', darkBg: '#78350F', darkFg: '#FCD34D' },
  { id: 'teal',    name: 'Teal',    bg: '#CCFBF1', fg: '#0F766E', darkBg: '#134E4A', darkFg: '#5EEAD4' },
  { id: 'indigo',  name: 'Indigo',  bg: '#E0E7FF', fg: '#4338CA', darkBg: '#312E81', darkFg: '#A5B4FC' },
  { id: 'fuchsia', name: 'Fuchsia', bg: '#FAE8FF', fg: '#A21CAF', darkBg: '#701A75', darkFg: '#F0ABFC' },
  { id: 'charcoal',name: 'Dark',    bg: '#374151', fg: '#F9FAFB', darkBg: '#1F2937', darkFg: '#F3F4F6' },
  { id: 'clear',   name: 'Clear',   bg: 'transparent', fg: 'inherit' }
];

export const POPULAR_BULLETS = ['⚫', '🟢', '🟣', '🔵', '🔴', '🟠', '🟡', '⭐', '⚡', '🎯', '🚑', '🏥', '⚓', '🌿', '💡', '🛡️'];

export const DEFAULT_BULLET_STYLES = {
  '🟢': { bg: '#D1FAE5', fg: '#047857', color: 'emerald' },
  '🟣': { bg: '#EDE9FE', fg: '#6D28D9', color: 'violet' },
  '🔵': { bg: '#E0F2FE', fg: '#0369A1', color: 'azure' },
  '🔴': { bg: '#FFE4E6', fg: '#BE123C', color: 'coral' },
  '🟠': { bg: '#FEF3C7', fg: '#B45309', color: 'amber' },
  '🟡': { bg: '#FEF3C7', fg: '#B45309', color: 'amber' },
  '⚫': { bg: 'transparent', fg: 'inherit', color: 'clear' }
};

export const PRESET_COMBINATIONS = [
  { bullet: '🟢', color: 'emerald', bg: '#D1FAE5', fg: '#047857', name: 'Emerald Circle' },
  { bullet: '🟣', color: 'violet',  bg: '#EDE9FE', fg: '#6D28D9', name: 'Violet Circle' },
  { bullet: '🔵', color: 'azure',   bg: '#E0F2FE', fg: '#0369A1', name: 'Azure Circle' },
  { bullet: '🔴', color: 'coral',   bg: '#FFE4E6', fg: '#BE123C', name: 'Coral Circle' },
  { bullet: '🟠', color: 'amber',   bg: '#FEF3C7', fg: '#B45309', name: 'Amber Circle' },
  { bullet: '🟡', color: 'amber',   bg: '#FEF3C7', fg: '#B45309', name: 'Yellow Circle' },
  { bullet: '⭐', color: 'amber',   bg: '#FEF3C7', fg: '#B45309', name: 'Star' },
  { bullet: '⚡', color: 'azure',   bg: '#E0F2FE', fg: '#0369A1', name: 'Lightning' },
  { bullet: '🎯', color: 'coral',   bg: '#FFE4E6', fg: '#BE123C', name: 'Target' },
  { bullet: '🌿', color: 'emerald', bg: '#D1FAE5', fg: '#047857', name: 'Leaf' },
  { bullet: '💡', color: 'amber',   bg: '#FEF3C7', fg: '#B45309', name: 'Idea' },
  { bullet: '🛡️', color: 'indigo',  bg: '#E0E7FF', fg: '#4338CA', name: 'Shield' },
  { bullet: '⚓', color: 'teal',    bg: '#CCFBF1', fg: '#0F766E', name: 'Anchor' },
  { bullet: '🚑', color: 'coral',   bg: '#FFE4E6', fg: '#BE123C', name: 'Ambulance' },
  { bullet: '🏥', color: 'teal',    bg: '#CCFBF1', fg: '#0F766E', name: 'Hospital' },
  { bullet: '💎', color: 'fuchsia', bg: '#FAE8FF', fg: '#A21CAF', name: 'Diamond' }
];

/**
 * Extracts leading bullet and clean text from a raw text line.
 */
export function parseLine(rawLine) {
  if (!rawLine && rawLine !== '') return { bullet: DEFAULT_BULLET, text: '' };
  const trimmed = rawLine.trimStart();
  if (!trimmed) return { bullet: DEFAULT_BULLET, text: '' };

  // Match emoji or standard bullet symbols at start of line (excluding brackets and text punctuation)
  const emojiRegex = /^(\p{Extended_Pictographic}\uFE0F?|\p{Emoji_Presentation}|[⚫⚪▪▫◼◻◆◇])\s*(.*)$/u;
  const match = trimmed.match(emojiRegex);
  if (match) {
    return {
      bullet: match[1],
      text: match[2]
    };
  }

  // Handle standard dash/bullet/star prefixes from legacy text (e.g. "- item", "* item", "• item")
  const listPrefixMatch = trimmed.match(/^[-*•]\s+(.*)$/);
  if (listPrefixMatch) {
    return {
      bullet: DEFAULT_BULLET,
      text: listPrefixMatch[1]
    };
  }

  return {
    bullet: DEFAULT_BULLET,
    text: trimmed
  };
}

/**
 * Serializes bullet and text into a line string.
 */
export function serializeLine(bullet, text) {
  const b = bullet || DEFAULT_BULLET;
  const t = text || '';
  return t ? `${b} ${t}` : b;
}

/**
 * Ensures all non-empty lines in a raw text block have bullet markers.
 * Used when restoring older versions or migrating plain text content.
 */
export function ensureBullets(rawText) {
  if (!rawText && rawText !== '') return '';
  const lines = rawText.split('\n');
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const { bullet, text } = parseLine(line);
    result.push(serializeLine(bullet, text));
  }
  return result.join('\n');
}
