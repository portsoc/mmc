// row-spacing.js — auto-sizes the space between rows in every section (grid
// and focus view). Each list's spare height is shared between its gaps, up to
// 1em extra per gap, shrinking back to normal spacing as the section fills.
//
// No jitter: every list is reset, measured and set in one synchronous pass
// inside requestAnimationFrame, so nothing paints between steps. A gap never
// exceeds its own section's slack, so spacing can't make a grid row grow and
// trigger another refit.

const MAX_GAP_EM = 1;
let queued = false;

/** The box each list may fill: its grid section, or the focus view. */
function boundsFor(list) {
  return list.closest('#focus-slot') || list.closest('.grid-item');
}

function innerBottom(box) {
  const style = getComputedStyle(box);
  return box.getBoundingClientRect().bottom
    - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth);
}

function refit() {
  queued = false;
  const lists = [...document.querySelectorAll('.canvas-list')].filter(boundsFor);
  for (const list of lists) list.style.setProperty('--row-gap', '0px');
  // Measure everything before writing anything, so layout is computed once.
  const gaps = lists.map((list) => {
    const rows = list.children.length;
    if (rows < 2) return 0;
    const box = boundsFor(list);
    const editable = list.closest('.e');
    const pad = editable ? parseFloat(getComputedStyle(editable).paddingBottom) : 0;
    // The list itself stretches to fill (min-height: 100%), so measure its last row.
    const last = list.lastElementChild;
    const used = last.getBoundingClientRect().bottom + parseFloat(getComputedStyle(last).marginBottom);
    const slack = innerBottom(box) - pad - used;
    const max = MAX_GAP_EM * parseFloat(getComputedStyle(list).fontSize);
    return Math.max(0, Math.min(max, Math.floor(slack / (rows - 1))));
  });
  lists.forEach((list, i) => list.style.setProperty('--row-gap', `${gaps[i]}px`));
}

/** Refit on the next frame; repeated calls in one frame coalesce. */
export function scheduleRowSpacing() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(refit);
}

/** Refit whenever section text changes (local typing, remote edits, playback)
 * or the window resizes. Our own writes only touch the list's style
 * attribute, which isn't observed, so they don't retrigger. */
export function initRowSpacing() {
  const observer = new MutationObserver(scheduleRowSpacing);
  for (const editable of document.querySelectorAll('.grid-item .e')) {
    observer.observe(editable, { childList: true, subtree: true, characterData: true });
  }
  window.addEventListener('resize', scheduleRowSpacing);
  document.fonts?.ready.then(scheduleRowSpacing);
  scheduleRowSpacing();
}
