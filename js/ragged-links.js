// ragged-links.js — Semantic Unordered Lists & CSS ::before Emoji Bullets
// Pure semantic HTML5 (<ul><li>) with CSS ::before emoji bullets.
// No child spans inside <li> — plain text content only.
// Native browser list editing (Enter creates <li>, Backspace removes empty <li>).
// Unified Pointer Events for desktop right-click, mobile long-press, and drag-to-associate.

import {
  normalizeSection,
  itemsToPlainText,
  generateItemId,
  generateAssocId
} from './item-migration.js';

export {
  normalizeSection,
  itemsToPlainText,
  generateItemId,
  generateAssocId
};

import {
  DEFAULT_BULLET,
  DEFAULT_BULLET_STYLES,
  PRESET_COMBINATIONS,
  parseLine
} from './bullets.js';

export * from './bullets.js';

import { bulletPopupMethods } from './bullet-popup.js';

const RECENT_KEY = 'mmc-recent-bullets';
const STYLES_KEY = 'mmc-bullet-styles';

/**
 * RaggedLinksController manages semantic unordered lists (<ul><li>),
 * CSS ::before emoji bullets, context popup, and unified pointer drag-to-associate.
 */
export class RaggedLinksController {
  constructor(elementsById, onTextChange, initialStyles = {}) {
    this.elementsById = elementsById || {};
    this.onTextChange = onTextChange;
    this.bulletStyles = { ...DEFAULT_BULLET_STYLES, ...initialStyles, ...this._loadSavedStyles() };
    this.bulletStyles[DEFAULT_BULLET] = { bg: 'transparent', fg: 'inherit', color: 'clear' };
    this.bulletStyles['⚫'] = { bg: 'transparent', fg: 'inherit', color: 'clear' };
    this.activePopup = null;
    this.targetLi = null;

    if (typeof document !== 'undefined' && document.body) {
      this._createPopup();
      this._initSections();
      this._bindEvents();
    }
  }

  _loadSavedStyles() {
    try {
      const styles = JSON.parse(localStorage.getItem(STYLES_KEY) || '{}');
      if (styles[DEFAULT_BULLET] || styles['⚫']) {
        delete styles[DEFAULT_BULLET];
        delete styles['⚫'];
        localStorage.setItem(STYLES_KEY, JSON.stringify(styles));
      }
      return styles;
    } catch {
      return {};
    }
  }

  _saveStyles() {
    try {
      localStorage.setItem(STYLES_KEY, JSON.stringify(this.bulletStyles));
    } catch { /* ignored */ }
  }

  getRecentBullets() {
    try {
      const recents = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(recents) ? recents.slice(0, 10) : [];
    } catch {
      return [];
    }
  }

  addRecentBullet(char) {
    if (!char || char === DEFAULT_BULLET) return;
    try {
      const recents = this.getRecentBullets().filter(c => c !== char);
      recents.unshift(char);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, 10)));
    } catch { /* ignored */ }
  }

  getDocumentBullets() {
    const set = new Set();
    for (const el of Object.values(this.elementsById)) {
      if (!el) continue;
      const items = el.querySelectorAll('.canvas-list li');
      items.forEach(li => {
        const b = li.getAttribute('data-bullet') || DEFAULT_BULLET;
        if (b) set.add(b);
      });
    }
    return Array.from(set);
  }

  getInUseCombinations() {
    const map = new Map();

    const sections = Object.values(this.elementsById).filter(Boolean);
    let elementsToScan = [];
    if (sections.length > 0) {
      elementsToScan = sections.flatMap(sec => {
        const list = sec.querySelector?.('.canvas-list') || sec;
        const lis = list.querySelectorAll?.('li') || [];
        return Array.from(lis);
      });
    }
    if (elementsToScan.length === 0 && typeof document !== 'undefined' && document.querySelectorAll) {
      elementsToScan = Array.from(document.querySelectorAll('.canvas-list li'));
    }

    for (const li of elementsToScan) {
      const bullet = li.getAttribute?.('data-bullet') || DEFAULT_BULLET;
      const color = li.getAttribute?.('data-color') || '';
      const bg = li.style?.getPropertyValue ? li.style.getPropertyValue('--row-bg') : (li.style?.['--row-bg'] || '');
      const fg = li.style?.getPropertyValue ? li.style.getPropertyValue('--row-fg') : (li.style?.['--row-fg'] || '');
      const assocId = li.getAttribute?.('data-assoc') || '';

      // Skip default black bullets with clear/transparent background
      const isDefault = (bullet === DEFAULT_BULLET || bullet === '⚫') && (!color || color === 'clear') && (!bg || bg === 'transparent');
      if (isDefault) continue;

      let effectiveColor = color;
      let effectiveBg = bg;
      let effectiveFg = fg;

      // Check if bullet matches a preset style if color/bg not explicitly set
      if (!effectiveColor && !effectiveBg) {
        const preset = PRESET_COMBINATIONS.find(p => p.bullet === bullet);
        if (preset) {
          effectiveColor = preset.color;
          effectiveBg = preset.bg;
          effectiveFg = preset.fg;
        } else if (DEFAULT_BULLET_STYLES[bullet]) {
          effectiveColor = DEFAULT_BULLET_STYLES[bullet].color || '';
          effectiveBg = DEFAULT_BULLET_STYLES[bullet].bg || '';
          effectiveFg = DEFAULT_BULLET_STYLES[bullet].fg || '';
        }
      }

      // Group key based on bullet and effective color/bg
      const key = `${bullet}__${effectiveColor || effectiveBg || 'none'}`;

      if (map.has(key)) {
        const item = map.get(key);
        item.count += 1;
        if (!item.assocId && assocId) item.assocId = assocId;
      } else {
        map.set(key, {
          key,
          bullet,
          color: effectiveColor,
          bg: effectiveBg,
          fg: effectiveFg,
          assocId,
          count: 1
        });
      }
    }

    return Array.from(map.values());
  }

  getAvailablePresets() {
    const inUse = this.getInUseCombinations();
    const inUseKeys = new Set(inUse.map(item => item.key));
    const inUseBullets = new Set(inUse.map(item => item.bullet));

    return PRESET_COMBINATIONS.filter(preset => {
      const key = `${preset.bullet}__${preset.color || preset.bg || 'none'}`;
      return !inUseKeys.has(key) && !inUseBullets.has(preset.bullet);
    });
  }

  _initSections() {
    for (const [fieldId, el] of Object.entries(this.elementsById)) {
      if (!el || !['kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if'].includes(fieldId)) continue;

      // Section itself is not directly contenteditable; the inner <ul> is.
      el.removeAttribute('contenteditable');

      // Populate existing content into semantic <ul><li>
      this.refreshSectionDom(el);

      // On Enter key, ensure newly created empty <li> defaults to black bullet ⚫
      // On Backspace on an empty line, delete the row and move cursor to previous line
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          setTimeout(() => {
            const sel = window.getSelection();
            const newLi = sel?.anchorNode?.nodeType === Node.ELEMENT_NODE
              ? sel.anchorNode.closest('li')
              : sel.anchorNode?.parentElement?.closest('li');
            if (newLi) {
              // No new id here: serializeSectionItems has already given the
              // copied row a fresh one, and changing it again desyncs it.
              if (!newLi.textContent.trim()) {
                newLi.removeAttribute('data-bullet');
                newLi.removeAttribute('data-color');
                newLi.removeAttribute('data-assoc');
                newLi.style.removeProperty('--row-bg');
                newLi.style.removeProperty('--row-fg');
              }
              this._notifyChange(fieldId, el);
            }
          }, 0);
        } else if (e.key === 'Backspace') {
          const sel = window.getSelection();
          const currentLi = sel?.anchorNode?.nodeType === Node.ELEMENT_NODE
            ? sel.anchorNode.closest('li')
            : sel.anchorNode?.parentElement?.closest('li');
          if (currentLi && !currentLi.textContent.trim()) {
            const prevLi = currentLi.previousElementSibling;
            if (prevLi) {
              e.preventDefault();
              currentLi.remove();
              const range = document.createRange();
              range.selectNodeContents(prevLi);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
              this._notifyChange(fieldId, el);
            }
          }
        }
      });

      // Bind input events from the <ul> to sync plain text to Yjs/Firestore
      el.addEventListener('input', (e) => {
        if (e.target.closest('.bullet-popup')) return;
        this._notifyChange(fieldId, el);
      });

      // Clean paste handling
      el.addEventListener('paste', (e) => this._handlePaste(e, el, fieldId));

      // Clicking anywhere in the section's padding/whitespace activates editing
      el.addEventListener('click', (e) => {
        if (e.target.closest('li') || e.target.closest('.bullet-popup')) return;
        const ul = el.querySelector('.canvas-list');
        if (!ul || ul.getAttribute('contenteditable') === 'false') return;
        let lastLi = ul.querySelector('li:last-child');
        if (!lastLi) {
          lastLi = this._createItem(DEFAULT_BULLET, '', fieldId);
          ul.appendChild(lastLi);
          this._notifyChange(fieldId, el);
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
      });
    }
  }

  refreshSectionDom(el) {
    if (!el) return;
    if (el.querySelector('.canvas-list')) return;

    const rawText = el.textContent || '';
    this.setSectionText(el, rawText);
  }

  setSectionItems(sectionEl, items) {
    if (!sectionEl) return;
    const fieldId = sectionEl.id?.slice(1) || 'item';
    const isReadOnly = sectionEl.getAttribute('contenteditable') === 'false';
    let ul = sectionEl.querySelector('.canvas-list');
    if (!ul) {
      ul = document.createElement('ul');
      ul.className = 'canvas-list';
      ul.setAttribute('contenteditable', isReadOnly ? 'false' : 'true');
      ul.setAttribute('role', 'list');
      sectionEl.replaceChildren(ul);
    } else {
      ul.setAttribute('contenteditable', isReadOnly ? 'false' : 'true');
      ul.replaceChildren();
    }

    const validItems = Array.isArray(items) && items.length > 0
      ? items
      : [{ id: generateItemId(fieldId), text: '', bullet: DEFAULT_BULLET, color: '', assocId: '' }];

    validItems.forEach(item => {
      ul.appendChild(this._createItem(item, null, fieldId));
    });
  }

  setSectionText(sectionEl, rawText) {
    if (!sectionEl) return;
    const current = this.serializeSection(sectionEl);
    if (current === (rawText || '')) return; // already in sync

    const fieldId = sectionEl.id?.slice(1) || 'item';
    const items = normalizeSection(rawText, fieldId);
    this.setSectionItems(sectionEl, items);
  }

  setReadOnly(readOnly) {
    for (const el of Object.values(this.elementsById)) {
      if (!el) continue;
      const ul = el.querySelector('.canvas-list');
      if (ul) ul.setAttribute('contenteditable', readOnly ? 'false' : 'true');
    }
  }

  _createItem(itemOrBullet, text = '', sectionId = 'item') {
    const li = document.createElement('li');
    let id = '';
    let b = DEFAULT_BULLET;
    let t = '';
    let color = '';
    let bg = '';
    let fg = '';
    let assocId = '';

    if (itemOrBullet && typeof itemOrBullet === 'object') {
      id = itemOrBullet.id || generateItemId(sectionId);
      b = itemOrBullet.bullet || DEFAULT_BULLET;
      t = itemOrBullet.text || '';
      color = itemOrBullet.color || '';
      bg = itemOrBullet.bg || '';
      fg = itemOrBullet.fg || '';
      assocId = itemOrBullet.assocId || '';
    } else {
      id = generateItemId(sectionId);
      b = itemOrBullet || DEFAULT_BULLET;
      t = text || '';
    }

    li.dataset.id = id;
    li.textContent = t;
    // An empty <li> collapses to zero height, hiding blank lines; typing
    // Enter gives the browser's own empty row a <br>, so match that.
    if (!t) li.appendChild(document.createElement('br'));

    if (b && b !== DEFAULT_BULLET) {
      li.setAttribute('data-bullet', b);
    }
    if (assocId) {
      li.setAttribute('data-assoc', assocId);
    }

    // Apply color styling if defined for this bullet or explicit in item
    const style = b !== DEFAULT_BULLET ? this.bulletStyles[b] : null;
    const effectiveColor = color || (style?.color && style.color !== 'clear' ? style.color : '');
    const effectiveBg = bg || (style?.bg && style.bg !== 'transparent' ? style.bg : '');
    const effectiveFg = fg || (style?.fg && style.fg !== 'inherit' ? style.fg : '');

    if (effectiveColor && effectiveColor !== 'clear') {
      li.setAttribute('data-color', effectiveColor);
    } else {
      li.removeAttribute('data-color');
    }
    if (effectiveBg) {
      li.style.setProperty('--row-bg', effectiveBg);
    } else {
      li.style.removeProperty('--row-bg');
    }
    if (effectiveFg) {
      li.style.setProperty('--row-fg', effectiveFg);
    } else {
      li.style.removeProperty('--row-fg');
    }

    return li;
  }

  applyStyleToRow(li, bullet, bg, fg, colorName) {
    if (!li) return;
    const b = bullet || DEFAULT_BULLET;
    if (b === DEFAULT_BULLET) {
      li.removeAttribute('data-bullet');
    } else {
      li.setAttribute('data-bullet', b);
    }

    if (colorName && colorName !== 'clear') {
      li.setAttribute('data-color', colorName);
    } else {
      li.removeAttribute('data-color');
    }

    if (bg && bg !== 'transparent') {
      li.style.setProperty('--row-bg', bg);
    } else {
      li.style.removeProperty('--row-bg');
    }

    if (fg && fg !== 'inherit') {
      li.style.setProperty('--row-fg', fg);
    } else {
      li.style.removeProperty('--row-fg');
    }

    // Save association only for non-default bullets
    if (b !== DEFAULT_BULLET) {
      this.bulletStyles[b] = { bg: bg || '', fg: fg || '', color: colorName || '' };
      this._saveStyles();
      this.addRecentBullet(b);
    }
  }

  getLinkedRows(targetLi) {
    if (!targetLi) return [];
    const linked = new Set();
    linked.add(targetLi);

    const assocId = targetLi.getAttribute('data-assoc');
    const currentBullet = targetLi.getAttribute('data-bullet') || DEFAULT_BULLET;

    const findLis = (predicate) => {
      if (typeof document !== 'undefined' && document.querySelectorAll) {
        try {
          document.querySelectorAll('.canvas-list li').forEach(li => {
            if (predicate(li)) linked.add(li);
          });
          return;
        } catch { /* fallback */ }
      }
      for (const el of Object.values(this.elementsById || {})) {
        if (!el) continue;
        const items = el.querySelectorAll ? el.querySelectorAll('.canvas-list li') : [];
        items.forEach(li => {
          if (predicate(li)) linked.add(li);
        });
      }
    };

    // 1. If row already has data-assoc, find all rows sharing this assocId
    if (assocId) {
      findLis(li => li.getAttribute('data-assoc') === assocId);
    }

    // 2. If row has a non-default bullet, find any rows across the canvas sharing the exact same bullet
    if (currentBullet && currentBullet !== DEFAULT_BULLET) {
      findLis(li => (li.getAttribute('data-bullet') || DEFAULT_BULLET) === currentBullet);
    }

    return Array.from(linked);
  }

  applyStyleToLinked(targetLi, bullet, bg, fg, colorName, forcedAssocId = null) {
    if (!targetLi) return;

    const newBullet = bullet || DEFAULT_BULLET;
    const isResetToDefault = newBullet === DEFAULT_BULLET && (!colorName || colorName === 'clear');

    // If resetting this specific item to default unbulleted and clear, unlink it alone
    if (isResetToDefault) {
      targetLi.removeAttribute('data-assoc');
      this.applyStyleToRow(targetLi, DEFAULT_BULLET, '', '', 'clear');
      this._notifyLiSection(targetLi);
      return;
    }

    // Find all linked rows before modifying styles
    const linkedLis = this.getLinkedRows(targetLi);

    // Determine shared assocId
    let assocId = forcedAssocId || targetLi.getAttribute('data-assoc');
    if (!assocId) {
      for (const li of linkedLis) {
        const a = li.getAttribute('data-assoc');
        if (a) {
          assocId = a;
          break;
        }
      }
      if (!assocId && (linkedLis.length > 1 || newBullet !== DEFAULT_BULLET)) {
        assocId = generateAssocId();
      }
    }

    const affectedSections = new Set();

    linkedLis.forEach(li => {
      if (assocId) {
        li.setAttribute('data-assoc', assocId);
      }
      this.applyStyleToRow(li, newBullet, bg, fg, colorName);
      const sec = li.closest ? li.closest('.e') : null;
      if (sec) affectedSections.add(sec);
    });

    if (affectedSections.size === 0) {
      this._notifyLiSection(targetLi);
    } else {
      for (const sec of affectedSections) {
        const fieldId = sec.id?.slice(1);
        if (fieldId) {
          this._notifyChange(fieldId, sec);
        }
      }
    }
  }

  associateRows(sourceLi, targetLi) {
    if (!sourceLi || !targetLi || sourceLi === targetLi) return;

    let assocId = sourceLi.getAttribute('data-assoc');
    if (!assocId) {
      assocId = generateAssocId();
      sourceLi.setAttribute('data-assoc', assocId);
      const sourceFieldId = sourceLi.closest?.('.e')?.id?.slice(1);
      if (sourceFieldId) this._notifyChange(sourceFieldId, sourceLi.closest('.e'));
    }

    const bullet = sourceLi.getAttribute('data-bullet') || DEFAULT_BULLET;
    const color = sourceLi.getAttribute('data-color') || '';
    const bg = sourceLi.style.getPropertyValue('--row-bg') || '';
    const fg = sourceLi.style.getPropertyValue('--row-fg') || '';

    const oldAssoc = targetLi.getAttribute('data-assoc');
    const affectedSections = new Set();
    const targetSec = targetLi.closest?.('.e');
    if (targetSec) affectedSections.add(targetSec);

    if (oldAssoc && oldAssoc !== assocId) {
      const safeOld = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(oldAssoc) : oldAssoc.replace(/["\\]/g, '\\$&');
      if (typeof document !== 'undefined' && document.querySelectorAll) {
        document.querySelectorAll(`.canvas-list li[data-assoc="${safeOld}"]`).forEach(li => {
          li.setAttribute('data-assoc', assocId);
          this.applyStyleToRow(li, bullet, bg, fg, color);
          const sec = li.closest?.('.e');
          if (sec) affectedSections.add(sec);
        });
      }
    } else {
      targetLi.setAttribute('data-assoc', assocId);
      this.applyStyleToRow(targetLi, bullet, bg, fg, color);
    }

    for (const sec of affectedSections) {
      const fieldId = sec.id?.slice(1);
      if (fieldId) this._notifyChange(fieldId, sec);
    }
  }

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
  }

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
  }

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

  serializeSectionItems(sectionEl) {
    if (!sectionEl) return [];
    const list = sectionEl.querySelector('.canvas-list');
    if (!list) return [];
    const items = list.querySelectorAll('li');
    const fieldId = sectionEl.id?.slice(1) || 'item';
    const result = [];
    // Enter copies the current row's data-id onto the new row, and rows sync
    // by id, so give any repeat (and any missing id) a fresh one here.
    const seen = new Set();
    items.forEach(li => {
      if (!li.dataset.id || seen.has(li.dataset.id)) li.dataset.id = generateItemId(fieldId);
      seen.add(li.dataset.id);
      result.push({
        id: li.dataset.id,
        text: li.textContent || '',
        bullet: li.getAttribute('data-bullet') || DEFAULT_BULLET,
        color: li.getAttribute('data-color') || '',
        bg: li.style.getPropertyValue('--row-bg') || '',
        fg: li.style.getPropertyValue('--row-fg') || '',
        assocId: li.getAttribute('data-assoc') || ''
      });
    });
    return result;
  }

  _notifyChange(fieldId, sectionEl) {
    const items = this.serializeSectionItems(sectionEl);
    const rawText = itemsToPlainText(items);
    if (this.onTextChange) {
      this.onTextChange(fieldId, items, rawText);
    }
  }

  serializeSection(sectionEl) {
    if (!sectionEl) return '';
    const list = sectionEl.querySelector('.canvas-list');
    if (!list) return sectionEl.textContent || '';
    const items = list.querySelectorAll('li');
    if (items.length === 0) return '';

    const lines = [];
    items.forEach(li => {
      const bullet = li.getAttribute('data-bullet') || DEFAULT_BULLET;
      const text = li.textContent || '';
      lines.push(text ? `${bullet} ${text}` : bullet);
    });
    return lines.join('\n');
  }

  clearRowStyle(li, notify = true) {
    if (!li) return;
    li.setAttribute('data-bullet', DEFAULT_BULLET);
    li.removeAttribute('data-color');
    li.removeAttribute('data-assoc');
    if (li.style && li.style.removeProperty) {
      li.style.removeProperty('--row-bg');
      li.style.removeProperty('--row-fg');
    }
    if (notify) {
      this._notifyLiSection(li);
    }
  }

  clearCluster(anchorLi) {
    if (!anchorLi) return;
    const rows = this.getLinkedRows(anchorLi);
    const affectedSections = new Set();
    for (const row of rows) {
      const sec = row.closest?.('.e');
      if (sec) affectedSections.add(sec);
      this.clearRowStyle(row, false);
    }
    for (const sec of affectedSections) {
      const fieldId = sec.id?.slice(1);
      if (fieldId) this._notifyChange(fieldId, sec);
    }
  }

  _notifyLiSection(li) {
    const sectionEl = li.closest('.e');
    const fieldId = sectionEl?.id?.slice(1);
    if (fieldId) this._notifyChange(fieldId, sectionEl);
  }

  update() {
    for (const el of Object.values(this.elementsById)) {
      if (!el) continue;
      this.refreshSectionDom(el);
    }
  }
}

Object.assign(RaggedLinksController.prototype, bulletPopupMethods);
