import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { applyItemsToY, itemsFromY, itemsKey, seedItemsUpdate } from '../../js/yitems.js';

const item = (id, text, extra = {}) => ({ id, text, bullet: '⚫', color: '', bg: '', fg: '', assocId: '', ...extra });

function sync(a, b) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

test('items round-trip with links and colours as fields, not tags', () => {
  const doc = new Y.Doc();
  const yarr = doc.getArray(itemsKey('kp'));
  const items = [item('a', 'Partners', { assocId: 'assoc_1', bullet: '🟢', color: 'emerald', bg: '#D1FAE5' })];
  applyItemsToY(Y, yarr, items);
  assert.deepEqual(itemsFromY(yarr), items);
  assert.equal(yarr.get(0).get('text').toString(), 'Partners');
});

test('insert, delete and edit rows by id', () => {
  const doc = new Y.Doc();
  const yarr = doc.getArray(itemsKey('kp'));
  applyItemsToY(Y, yarr, [item('a', 'one'), item('b', 'two'), item('c', 'three')]);
  const next = [item('a', 'one!'), item('d', 'new'), item('c', 'three')];
  applyItemsToY(Y, yarr, next);
  assert.deepEqual(itemsFromY(yarr), next);
});

test('duplicate ids from Enter resolve once the new row gets its id', () => {
  const doc = new Y.Doc();
  const yarr = doc.getArray(itemsKey('kp'));
  applyItemsToY(Y, yarr, [item('a', 'one'), item('a', ''), item('b', 'two')]);
  const next = [item('a', 'one'), item('c', 'x'), item('b', 'two')];
  applyItemsToY(Y, yarr, next);
  assert.deepEqual(itemsFromY(yarr), next);
});

test('concurrent edits to different rows and fields all survive', () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  applyItemsToY(Y, a.getArray(itemsKey('kp')), [item('r1', 'hello'), item('r2', 'world')]);
  sync(a, b);
  applyItemsToY(Y, a.getArray(itemsKey('kp')), [item('r1', 'hello there'), item('r2', 'world')]);
  applyItemsToY(Y, b.getArray(itemsKey('kp')), [item('r1', 'hello'), item('r2', 'world', { color: 'coral' })]);
  sync(a, b);
  const merged = itemsFromY(a.getArray(itemsKey('kp')));
  assert.deepEqual(merged, [item('r1', 'hello there'), item('r2', 'world', { color: 'coral' })]);
  assert.deepEqual(itemsFromY(b.getArray(itemsKey('kp'))), merged);
});

test('two clients seeding the same saved items do not double them', () => {
  const saved = [item('a', 'one'), item('b', 'two')];
  const a = new Y.Doc();
  const b = new Y.Doc();
  Y.applyUpdate(a, seedItemsUpdate(Y, 'kp', saved));
  Y.applyUpdate(b, seedItemsUpdate(Y, 'kp', saved));
  sync(a, b);
  assert.deepEqual(itemsFromY(a.getArray(itemsKey('kp'))), saved);
});
