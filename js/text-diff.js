/**
 * Replace ytext's content with newText by changing only the span that differs,
 * so concurrent edits elsewhere in the same field survive the merge.
 */
export function applyTextDiff(ytext, newText, origin) {
  const oldText = ytext.toString();
  if (oldText === newText) return;
  let start = 0;
  const maxStart = Math.min(oldText.length, newText.length);
  while (start < maxStart && oldText[start] === newText[start]) start++;
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  ytext.doc.transact(() => {
    if (oldEnd > start) ytext.delete(start, oldEnd - start);
    if (newEnd > start) ytext.insert(start, newText.slice(start, newEnd));
  }, origin);
}
