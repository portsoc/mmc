/**
 * Replace ytext's content with newText by changing only the span that differs,
 * so concurrent edits elsewhere in the same field survive the merge.
 */
export function applyTextDiff(ytext, newText, origin) {
  const oldText = ytext.toString();
  if (oldText === newText) return;
  const { start, removed, inserted } = textDiff(oldText, newText);
  ytext.doc.transact(() => {
    if (removed > 0) ytext.delete(start, removed);
    if (inserted) ytext.insert(start, inserted);
  }, origin);
}

/** The single span that differs: `removed` chars at `start` replaced by `inserted`. */
export function textDiff(oldText, newText) {
  let start = 0;
  const maxStart = Math.min(oldText.length, newText.length);
  while (start < maxStart && oldText[start] === newText[start]) start++;
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return { start, removed: oldEnd - start, inserted: newText.slice(start, newEnd) };
}

/** How many characters one edit changed (typed plus deleted). */
export function changedChars(oldText, newText) {
  const { removed, inserted } = textDiff(oldText, newText);
  return removed + inserted.length;
}
