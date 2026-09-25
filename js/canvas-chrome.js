// Canvas chrome: section click-to-edit, Escape handling, the focus modal and the help dialog.

import { initRowSpacing, scheduleRowSpacing } from './row-spacing.js';
const el = {};
const mmc = {
  current: []
};

function focusSectionOnClick(event) {
  const gridItem = event.target.closest('.grid-item');

  // Normal clicks: NEVER preventDefault! Allow native caret placement and editing.
  if (event.target.isContentEditable || event.target.closest('[contenteditable="true"]') || event.target.closest('li')) {
    return;
  }

  // If clicked on whitespace of the grid-item, delegate focus to its editable area
  const editableChild = gridItem?.querySelector('.e') || gridItem?.querySelector('[contenteditable]');
  if (editableChild) {
    const list = editableChild.querySelector('.canvas-list');
    if (list && list.getAttribute('contenteditable') !== 'false') {
      let lastLi = list.querySelector('li:last-child');
      if (!lastLi) {
        lastLi = document.createElement('li');
        list.appendChild(lastLi);
      }
      lastLi.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(lastLi);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else if (editableChild.getAttribute('contenteditable') !== 'false') {
      editableChild.focus();
    }
  }
}

function keyboardHandler(event) {
  if (event.key === 'Escape') {
    const focusModal = document.querySelector('#focus-modal');
    if (focusModal?.open) {
      event.preventDefault();
      closeFocus();
      return;
    }
    document.activeElement.blur();
  }
}

function wireSwipeToDismiss(dialog) {
  if (!dialog) return;
  let startY = 0;
  let startX = 0;
  let isTracking = false;
  let isSwiping = false;

  dialog.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    startY = touch.clientY;
    startX = touch.clientX;
    isTracking = true;
    isSwiping = false;
  }, { passive: true });

  dialog.addEventListener('touchmove', (e) => {
    if (!isTracking || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - startY;
    const deltaX = touch.clientX - startX;

    const slot = dialog.querySelector('#focus-slot');
    const isAtTop = !slot || slot.scrollTop <= 0;

    // Trigger downward swipe when at the top of scroll
    if (deltaY > 8 && isAtTop && Math.abs(deltaY) > Math.abs(deltaX)) {
      isSwiping = true;
      dialog.style.transform = `translateY(${deltaY}px)`;
      dialog.style.opacity = `${Math.max(0.2, 1 - deltaY / 400)}`;
    }
  }, { passive: true });

  const endSwipe = (e) => {
    if (!isTracking) return;
    isTracking = false;
    if (isSwiping) {
      isSwiping = false;
      const touch = e.changedTouches?.[0];
      const deltaY = touch ? touch.clientY - startY : 0;
      if (deltaY > 70) {
        closeFocus({ animate: false });
      } else {
        dialog.style.transform = '';
        dialog.style.opacity = '';
      }
    }
  };

  dialog.addEventListener('touchend', endSwipe, { passive: true });
  dialog.addEventListener('touchcancel', endSwipe, { passive: true });
}

export function initCanvasChrome() {
  el.gridItems = document.querySelectorAll('.grid-item');
  el.editableElements = document.querySelectorAll('[contenteditable]');
  el.help = document.querySelector('#help');
  const focusModal = document.querySelector('#focus-modal');

  initRowSpacing();

  document.addEventListener('keydown', keyboardHandler);

  for (const item of el.gridItems) {
    item.addEventListener('click', focusSectionOnClick);

    // Tapping the panel icon opens/toggles the focus view
    const icon = item.querySelector('h2 img');
    if (icon) {
      icon.setAttribute('role', 'button');
      icon.setAttribute('tabindex', '0');
      icon.setAttribute('aria-label', `Focus ${item.querySelector('h2')?.textContent?.trim() || 'section'}`);
      icon.title = 'Focus this section';

      const toggleFocus = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (focusModal?.open) {
          closeFocus();
        } else {
          openFocus(item);
        }
      };

      icon.addEventListener('click', toggleFocus);
      icon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          toggleFocus(e);
        }
      });
    }
  }

  el.help?.addEventListener('click', openUsageDialog);
  document.querySelector('#usage-close')?.addEventListener('click', () => {
    document.querySelector('#usage').close();
  });

  document.querySelector('#focus-close')?.addEventListener('click', () => closeFocus());
  // The browser's own Escape/close request would skip the animation.
  focusModal?.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeFocus();
  });

  // Clicking the backdrop closes any dialog, except ones marked
  // data-keep-open (forms, where a stray click would lose typing). A click on
  // the dialog's own padding also targets the dialog, so test the rectangle.
  for (const dialog of document.querySelectorAll('dialog:not([data-keep-open])')) {
    dialog.addEventListener('click', (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside) return;
      if (dialog === focusModal) closeFocus();
      else dialog.close();
    });
  }

  // Swiping away the focus modal on touch devices:
  wireSwipeToDismiss(focusModal);

  // Clicking anywhere on the heading edits the title, even when it's empty.
  const title = document.querySelector('#title');
  title?.parentElement.addEventListener('click', (e) => {
    if (e.target !== title) title.focus();
  });

}

/** Runs `update` inside a view transition that morphs the section box,
 * heading and text between the grid and the focus view. Falls back to a
 * plain update without View Transitions support or with reduced motion. */
const VT_NAMES = { box: 'mmc-focus-box', head: 'mmc-focus-head', icon: 'mmc-focus-icon', text: 'mmc-focus-text' };
function withFocusTransition(gridItem, opening, update) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce || !gridItem) {
    update();
    return;
  }
  const dialog = document.querySelector('#focus-modal');
  const panel = [gridItem, gridItem.querySelector('h2')];
  const modal = [dialog, document.querySelector('#focus-title')];
  const editable = gridItem.querySelector('.e') || dialog.querySelector('#focus-slot .e');
  const name = ([box, head], on) => {
    box.style.viewTransitionName = on ? VT_NAMES.box : '';
    head.style.viewTransitionName = on ? VT_NAMES.head : '';
    // The icon sits at different ends of the heading in the grid and the
    // modal, so it needs its own name to travel rather than fade in place.
    const icon = head.querySelector('img');
    if (icon) icon.style.viewTransitionName = on ? VT_NAMES.icon : '';
  };
  // The editable is the same element in both states, so it keeps its name.
  if (editable) editable.style.viewTransitionName = VT_NAMES.text;
  name(opening ? panel : modal, true);
  const vt = document.startViewTransition(() => {
    name(opening ? panel : modal, false);
    update();
    name(opening ? modal : panel, true);
  });
  vt.finished.finally(() => {
    name(panel, false);
    name(modal, false);
    if (editable) editable.style.viewTransitionName = '';
  });
}

let focusedItem = null;

/** Closes the focus view, animating back into the grid unless `animate`
 * is false (swipe-to-dismiss already animates itself). */
function closeFocus({ animate = true } = {}) {
  const dialog = document.querySelector('#focus-modal');
  if (!dialog?.open) return;
  if (animate) withFocusTransition(focusedItem, false, () => dialog.close());
  else dialog.close();
}

/** Moves the section's own editable element into a focus dialog and
 * back on close, so sync/save listeners bound to it keep working. */
function openFocus(gridItem) {
  const editable = gridItem.querySelector('.e');
  if (!editable) return;
  const dialog = document.querySelector('#focus-modal');
  if (dialog.open) {
    closeFocus();
    return;
  }
  withFocusTransition(gridItem, true, () => showFocus(gridItem, editable, dialog));
}

function showFocus(gridItem, editable, dialog) {
  focusedItem = gridItem;

  // Copy the heading including its icon, minus the id so it stays unique.
  const heading = gridItem.querySelector('h2').cloneNode(true);
  heading.removeAttribute('id');
  const titleEl = document.querySelector('#focus-title');
  titleEl.replaceChildren(...heading.childNodes);

  // Tapping the icon in the focus header closes it:
  const modalIcon = titleEl.querySelector('img');
  if (modalIcon) {
    modalIcon.setAttribute('role', 'button');
    modalIcon.setAttribute('tabindex', '0');
    modalIcon.setAttribute('aria-label', 'Close focus view');
    modalIcon.title = 'Close focus view';
    const closeModal = (e) => {
      e.stopPropagation();
      e.preventDefault();
      closeFocus();
    };
    modalIcon.addEventListener('click', closeModal);
    modalIcon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') closeModal(e);
    });
  }

  const marker = document.createComment('focus');
  editable.before(marker);
  const slot = document.querySelector('#focus-slot');
  slot.append(editable);
  dialog.addEventListener('close', () => {
    focusedItem = null;
    dialog.style.transform = '';
    dialog.style.opacity = '';
    marker.replaceWith(editable);
    scheduleRowSpacing();
  }, { once: true });
  dialog.showModal();
  scheduleRowSpacing();

  // A <li> can't take focus itself; focus the editable list and put the
  // caret at the end of its last line, so typing goes straight in.
  const list = editable.querySelector('.canvas-list');
  const target = list || editable;
  target.focus();
  const lastLine = list?.querySelector('li:last-child');
  const sel = window.getSelection();
  if (lastLine && sel) {
    const range = document.createRange();
    range.selectNodeContents(lastLine);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function openUsageDialog() {
  document.querySelector('#usage').showModal();
}
