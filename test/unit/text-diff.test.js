import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { applyTextDiff, changedChars } from '../../js/text-diff.js';

function pair(initial) {
  const a = new Y.Doc();
  a.getText('f').insert(0, initial);
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  return [a, b];
}

test('applyTextDiff sets the new text', () => {
  const [a] = pair('hello world');
  applyTextDiff(a.getText('f'), 'hello brave world');
  assert.equal(a.getText('f').toString(), 'hello brave world');
});

test('concurrent edits in the same field both survive', () => {
  const [a, b] = pair('line one\nline two');
  applyTextDiff(a.getText('f'), 'line one A\nline two');
  applyTextDiff(b.getText('f'), 'line one\nline two B');
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  assert.equal(a.getText('f').toString(), 'line one A\nline two B');
  assert.equal(b.getText('f').toString(), a.getText('f').toString());
});

test('changedChars counts only the edited span, not the whole field', () => {
  const long = 'x'.repeat(500);
  assert.equal(changedChars(long, long + 'a'), 1);
  assert.equal(changedChars('hello world', 'hello brave world'), 6);
  assert.equal(changedChars('hello world', 'hello'), 6);
  assert.equal(changedChars('cat', 'cut'), 2);
  assert.equal(changedChars('same', 'same'), 0);
});
