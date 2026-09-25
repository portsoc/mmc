// WP09 — Legacy localStorage → Firebase canvas migration.
import { createCanvas, updateField, FIELD_IDS } from './canvas-data.js';

const LEGACY_KEY = 'mmc';
const MIGRATED_KEY = 'mmc_migrated';

export function readLegacyCanvas() {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const nonEmpty = (parsed.current || []).some((item) => item.content?.trim());
    return nonEmpty ? parsed : null;
  } catch {
    return null;
  }
}

export function hasUnmigratedLegacyCanvas() {
  return !!readLegacyCanvas() && localStorage.getItem(MIGRATED_KEY) !== 'true';
}

/** Copies legacy field content into a freshly created Firebase canvas. */
export async function importLegacyToCloud(ownerId) {
  const legacy = readLegacyCanvas();
  if (!legacy) throw new Error('No legacy canvas to import');

  const canvasId = await createCanvas(ownerId, 'Imported Canvas');
  for (const item of legacy.current) {
    if (FIELD_IDS.includes(item.id)) {
      const text = stripHtml(item.content);
      await updateField(canvasId, item.id, text);
    }
  }
  localStorage.setItem(MIGRATED_KEY, 'true');
  return canvasId;
}

export function exportLegacyAsJson() {
  const legacy = readLegacyCanvas();
  if (!legacy) throw new Error('No legacy canvas to export');
  const blob = new Blob([JSON.stringify(legacy, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mmc-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}
