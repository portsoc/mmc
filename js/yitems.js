// Live item records for each canvas section: a Y.Array of Y.Maps, one per
// row, each holding its text as a Y.Text plus bullet, colour and link as plain
// fields. Same shape as the saved Firestore `items`, so no tags in the text.
//
// Y is passed in because the browser loads Yjs from a CDN and tests from npm.
import { applyTextDiff } from './text-diff.js';

const SCALAR_KEYS = ['bullet', 'color', 'bg', 'fg', 'assocId'];

export function itemsKey(fieldId) {
  return `items:${fieldId}`;
}

export function itemsFromY(yarr) {
  return yarr.toArray().map((ymap) => {
    const item = { id: ymap.get('id'), text: ymap.get('text')?.toString() ?? '' };
    for (const key of SCALAR_KEYS) item[key] = ymap.get(key) ?? '';
    return item;
  });
}

function newYItem(Y, item) {
  const ymap = new Y.Map();
  ymap.set('id', item.id);
  ymap.set('text', new Y.Text(item.text || ''));
  for (const key of SCALAR_KEYS) ymap.set(key, item[key] || '');
  return ymap;
}

function updateYItem(ymap, item, origin) {
  applyTextDiff(ymap.get('text'), item.text || '', origin);
  for (const key of SCALAR_KEYS) {
    if ((ymap.get(key) ?? '') !== (item[key] || '')) ymap.set(key, item[key] || '');
  }
}

/**
 * Make yarr match items with the smallest change: rows are matched by id in
 * order, so an edit touches only that row's text or fields and concurrent
 * edits to other rows (or elsewhere in the same row) survive.
 */
export function applyItemsToY(Y, yarr, items, origin) {
  yarr.doc.transact(() => {
    let j = 0;
    for (const item of items) {
      if (j < yarr.length && yarr.get(j).get('id') === item.id) {
        updateYItem(yarr.get(j), item, origin);
        j++;
        continue;
      }
      let k = j + 1;
      while (k < yarr.length && yarr.get(k).get('id') !== item.id) k++;
      if (k < yarr.length) {
        // Rows between j and k were removed locally.
        yarr.delete(j, k - j);
        updateYItem(yarr.get(j), item, origin);
      } else {
        yarr.insert(j, [newYItem(Y, item)]);
      }
      j++;
    }
    if (j < yarr.length) yarr.delete(j, yarr.length - j);
  }, origin);
}

function hashClientId(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

/**
 * A Yjs update that fills an empty section from saved items. The client id is
 * derived from the content, so two clients seeding the same canvas at once
 * produce identical structs that Yjs merges into one copy instead of doubling.
 */
export function seedItemsUpdate(Y, fieldId, items) {
  const seeded = items.map((item, i) => ({ ...item, id: item.id || `i_${fieldId}_s${i}` }));
  const doc = new Y.Doc();
  doc.clientID = hashClientId(`${fieldId}\u0000${JSON.stringify(seeded)}`);
  doc.getArray(itemsKey(fieldId)).insert(0, seeded.map((item) => newYItem(Y, item)));
  return Y.encodeStateAsUpdate(doc);
}

/** Same deterministic seeding for a plain Y.Text field (title, author). */
export function seedTextUpdate(Y, fieldId, text) {
  const doc = new Y.Doc();
  doc.clientID = hashClientId(`${fieldId}\u0000${text}`);
  doc.getText(fieldId).insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}
