// Canvas chrome: section click/defocus, URL-fragment presentation,
// Escape handling, the focus modal and the help dialog.
const el = {};
const mmc = {
  current: []
};

function toggleItem(event) {
  const gridItem = event.target.closest('.grid-item');
  if (event.metaKey || event.shiftKey) {
    event.preventDefault();
    gridItem?.classList.toggle('lo');
    updateURL();
    return;
  }

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

function updateURL() {
  const inverseIds = [];
  for (const element of document.querySelectorAll('.grid-item')) {
    if (!element.classList.contains('lo')) {
      inverseIds.push(element.id);
    }
  }
  let fragment = ''
  if (inverseIds.length > 0 && inverseIds.length < 9  ) {
    fragment = inverseIds.join('-');
  }
  setFragment(fragment);
}

function setFragment(fragment) {
  const url = `${window.location.pathname}${window.location.search}#${fragment}`;
  window.history.replaceState(null, null, url);
}

function handleFragment() {
  const fragment = window.location.hash.slice(1);
  if (fragment) {
    const ids = fragment.split('-');
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) {
        element.classList.remove('lo');
      }
    }
    for (const element of document.querySelectorAll('.grid-item')) {
      if (!ids.includes(element.id)) {
        element.classList.add('lo');
      }
    }
  }
}

function keyboardHandler(event) {
  if (event.key === 'Escape') {
    const focusModal = document.querySelector('#focus-modal');
    if (focusModal?.open) {
      focusModal.close();
      return;
    }
    document.activeElement.blur();
  }
  const gridItem = event.target.closest('.grid-item');
  if (gridItem) {
    if (gridItem.classList.contains('lo')) {
      gridItem.classList.remove('lo');
    }
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
        dialog.close();
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

  handleFragment();

  document.addEventListener('keydown', keyboardHandler);

  for (const item of el.gridItems) {
    item.addEventListener('click', toggleItem);

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
          focusModal.close();
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

  document.querySelector('#focus-close')?.addEventListener('click', () => {
    focusModal?.close();
  });

  // Clicking the backdrop closes any dialog, except ones marked
  // data-keep-open (forms, where a stray click would lose typing). A click on
  // the dialog's own padding also targets the dialog, so test the rectangle.
  for (const dialog of document.querySelectorAll('dialog:not([data-keep-open])')) {
    dialog.addEventListener('click', (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dialog.close();
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

/** Moves the section's own editable element into a focus dialog and
 * back on close, so sync/save listeners bound to it keep working. */
function openFocus(gridItem) {
  const editable = gridItem.querySelector('.e');
  if (!editable) return;
  const dialog = document.querySelector('#focus-modal');
  if (dialog.open) {
    dialog.close();
    return;
  }

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
      dialog.close();
    };
    modalIcon.addEventListener('click', closeModal);
    modalIcon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') closeModal(e);
    });
  }

  const marker = document.createComment('focus');
  editable.before(marker);
  document.querySelector('#focus-slot').append(editable);
  dialog.addEventListener('close', () => {
    dialog.style.transform = '';
    dialog.style.opacity = '';
    marker.replaceWith(editable);
  }, { once: true });
  dialog.showModal();

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
