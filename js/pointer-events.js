// pointer-events.js — bullet hit-testing, touch/mouse drag-to-link, key and paste handling.
// Mixed into RaggedLinksController; methods use the controller via `this`.

import { DEFAULT_BULLET, parseLine } from './bullets.js';

export const pointerEventMethods = {
  _isBulletHit(clientX, clientY, li) {
    if (!li) return false;
    if (li.closest?.('.canvas-list[contenteditable="false"]')) return false;
    if (typeof li.getBoundingClientRect !== 'function') return false;
    const rect = li.getBoundingClientRect();
    if (clientY !== undefined && (clientY < rect.top - 6 || clientY > rect.bottom + 6)) return false;
    const fontSize = (typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(li).fontSize) : 16) || 16;
    const bulletZone = Math.max(16, 1.15 * fontSize);
    const relX = clientX - rect.left;
    return relX >= -12 && relX <= bulletZone;
  },

  _bindEvents() {
    // --- Mobile Touch Handlers ---
    let touchSourceLi = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchLongPressTimer = null;
    let touchIsDragging = false;
    let touchDragAvatar = null;
    let touchCurrentTargetLi = null;

    document.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const li = touch.target?.closest?.('.canvas-list li');
      if (!li || !this._isBulletHit(touch.clientX, touch.clientY, li)) return;

      // Prevent native keyboard focus, text magnification loupe, and scroll gesture cancellation
      e.preventDefault();

      touchSourceLi = li;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchIsDragging = false;
      touchCurrentTargetLi = null;

      clearTimeout(touchLongPressTimer);
      touchLongPressTimer = setTimeout(() => {
        if (!touchIsDragging && touchSourceLi) {
          try { navigator.vibrate?.(40); } catch { /* ignore */ }
          this.openPopup(touchSourceLi);
          touchSourceLi = null;
        }
      }, 450);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!touchSourceLi) return;
      const touch = e.touches[0];
      if (!touch) return;

      const dist = Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY);

      if (!touchIsDragging && dist > 10) {
        clearTimeout(touchLongPressTimer);
        touchIsDragging = true;
        window.getSelection()?.removeAllRanges();

        touchDragAvatar = document.createElement('div');
        touchDragAvatar.className = 'touch-drag-avatar';
        touchDragAvatar.textContent = touchSourceLi.getAttribute('data-bullet') || DEFAULT_BULLET;
        const bg = touchSourceLi.style.getPropertyValue('--row-bg') || '';
        const fg = touchSourceLi.style.getPropertyValue('--row-fg') || '';
        if (bg) touchDragAvatar.style.background = bg;
        if (fg) touchDragAvatar.style.color = fg;
        document.body.appendChild(touchDragAvatar);
      }

      if (touchIsDragging) {
        e.preventDefault();
        if (touchDragAvatar) {
          touchDragAvatar.style.left = `${touch.clientX}px`;
          touchDragAvatar.style.top = `${touch.clientY}px`;
        }

        const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetLi = elUnder?.closest?.('.canvas-list li');

        if (targetLi !== touchCurrentTargetLi) {
          if (touchCurrentTargetLi) touchCurrentTargetLi.classList.remove('row-drag-over');
          touchCurrentTargetLi = targetLi;
          if (touchCurrentTargetLi && touchCurrentTargetLi !== touchSourceLi) {
            touchCurrentTargetLi.classList.add('row-drag-over');
          }
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      clearTimeout(touchLongPressTimer);
      if (touchDragAvatar) {
        touchDragAvatar.remove();
        touchDragAvatar = null;
      }
      if (touchCurrentTargetLi) {
        touchCurrentTargetLi.classList.remove('row-drag-over');
      }

      if (touchIsDragging && touchSourceLi) {
        const touch = e.changedTouches?.[0];
        if (touch) {
          const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
          const targetLi = elUnder?.closest?.('.canvas-list li');
          if (targetLi && targetLi !== touchSourceLi) {
            this.associateRows(touchSourceLi, targetLi);
            try { navigator.vibrate?.(30); } catch { /* ignore */ }
          } else if (targetLi === touchSourceLi) {
            this.openPopup(touchSourceLi);
          }
        }
      } else if (!touchIsDragging && touchSourceLi) {
        this.openPopup(touchSourceLi);
      }

      touchSourceLi = null;
      touchIsDragging = false;
      touchCurrentTargetLi = null;
    };

    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);

    // --- Desktop Mouse Handlers ---
    let mouseSourceLi = null;
    let mouseStartX = 0;
    let mouseStartY = 0;
    let mouseIsDragging = false;
    let mouseDragAvatar = null;
    let mouseCurrentTargetLi = null;

    document.addEventListener('contextmenu', (e) => {
      const li = e.target.closest?.('.canvas-list li');
      if (li && this._isBulletHit(e.clientX, e.clientY, li)) {
        e.preventDefault();
        e.stopPropagation();
        this.openPopup(li);
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const li = e.target.closest?.('.canvas-list li');
      if (!li || !this._isBulletHit(e.clientX, e.clientY, li)) return;

      e.preventDefault();
      mouseSourceLi = li;
      mouseStartX = e.clientX;
      mouseStartY = e.clientY;
      mouseIsDragging = false;
      mouseCurrentTargetLi = null;
    });

    window.addEventListener('mousemove', (e) => {
      if (!mouseSourceLi) return;
      const dist = Math.hypot(e.clientX - mouseStartX, e.clientY - mouseStartY);

      if (!mouseIsDragging && dist > 8) {
        mouseIsDragging = true;
        window.getSelection()?.removeAllRanges();

        mouseDragAvatar = document.createElement('div');
        mouseDragAvatar.className = 'touch-drag-avatar';
        mouseDragAvatar.textContent = mouseSourceLi.getAttribute('data-bullet') || DEFAULT_BULLET;
        const bg = mouseSourceLi.style.getPropertyValue('--row-bg') || '';
        const fg = mouseSourceLi.style.getPropertyValue('--row-fg') || '';
        if (bg) mouseDragAvatar.style.background = bg;
        if (fg) mouseDragAvatar.style.color = fg;
        document.body.appendChild(mouseDragAvatar);
      }

      if (mouseIsDragging) {
        e.preventDefault();
        if (mouseDragAvatar) {
          mouseDragAvatar.style.left = `${e.clientX}px`;
          mouseDragAvatar.style.top = `${e.clientY}px`;
        }

        const elUnder = document.elementFromPoint(e.clientX, e.clientY);
        const targetLi = elUnder?.closest?.('.canvas-list li');

        if (targetLi !== mouseCurrentTargetLi) {
          if (mouseCurrentTargetLi) mouseCurrentTargetLi.classList.remove('row-drag-over');
          mouseCurrentTargetLi = targetLi;
          if (mouseCurrentTargetLi && mouseCurrentTargetLi !== mouseSourceLi) {
            mouseCurrentTargetLi.classList.add('row-drag-over');
          }
        }
      }
    });

    const endMouse = (e) => {
      if (mouseDragAvatar) {
        mouseDragAvatar.remove();
        mouseDragAvatar = null;
      }
      if (mouseCurrentTargetLi) {
        mouseCurrentTargetLi.classList.remove('row-drag-over');
      }

      if (mouseIsDragging && mouseSourceLi) {
        const elUnder = document.elementFromPoint(e.clientX, e.clientY);
        const targetLi = elUnder?.closest?.('.canvas-list li');
        if (targetLi && targetLi !== mouseSourceLi) {
          this.associateRows(mouseSourceLi, targetLi);
        } else if (targetLi === mouseSourceLi) {
          this.openPopup(mouseSourceLi);
        }
      } else if (!mouseIsDragging && mouseSourceLi) {
        this.openPopup(mouseSourceLi);
      }

      mouseSourceLi = null;
      mouseIsDragging = false;
      mouseCurrentTargetLi = null;
    };

    window.addEventListener('mouseup', endMouse);

    // Cross-block association highlighting on hover / focus
    const highlightAssoc = (li, add) => {
      if (!li) return;
      const assocId = li.getAttribute('data-assoc');
      const bullet = li.getAttribute('data-bullet');
      if (assocId) {
        const safeAssoc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(assocId) : assocId.replace(/["\\]/g, '\\$&');
        document.querySelectorAll(`.canvas-list li[data-assoc="${safeAssoc}"]`).forEach(el => {
          el.classList.toggle('assoc-highlight', add);
        });
      } else if (bullet && bullet !== DEFAULT_BULLET) {
        document.querySelectorAll('.canvas-list li').forEach(el => {
          if (el.getAttribute('data-bullet') === bullet) {
            el.classList.toggle('assoc-highlight', add);
          }
        });
      }
    };

    document.addEventListener('mouseover', (e) => {
      const li = e.target.closest?.('.canvas-list li');
      highlightAssoc(li, true);
    });

    document.addEventListener('mouseout', (e) => {
      const li = e.target.closest?.('.canvas-list li');
      highlightAssoc(li, false);
    });

    document.addEventListener('focusin', (e) => {
      const li = e.target.closest?.('.canvas-list li');
      highlightAssoc(li, true);
    });

    document.addEventListener('focusout', (e) => {
      const li = e.target.closest?.('.canvas-list li');
      highlightAssoc(li, false);
    });
  },

  _handlePaste(e, sectionEl, fieldId) {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    if (!pastedText) return;

    const lines = pastedText.split(/\r?\n/);
    const ul = sectionEl.querySelector('.canvas-list');
    if (!ul) return;

    const sel = window.getSelection();
    const currentLi = sel?.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? sel.anchorNode.closest('li')
      : sel.anchorNode?.parentElement?.closest('li');

    if (lines.length === 1 && currentLi) {
      document.execCommand('insertText', false, lines[0]);
      this._notifyChange(fieldId, sectionEl);
      return;
    }

    let insertAfter = currentLi;
    lines.forEach((line, idx) => {
      if (!line.trim() && idx > 0) return;
      const { bullet, text } = parseLine(line);
      if (idx === 0 && currentLi) {
        currentLi.textContent += text;
        if (bullet !== DEFAULT_BULLET) {
          currentLi.setAttribute('data-bullet', bullet);
        }
      } else {
        const newLi = this._createItem(bullet, text, fieldId);
        if (insertAfter) {
          insertAfter.insertAdjacentElement('afterend', newLi);
          insertAfter = newLi;
        } else {
          ul.appendChild(newLi);
          insertAfter = newLi;
        }
      }
    });

    this._notifyChange(fieldId, sectionEl);
  }
};
