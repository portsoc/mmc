// bullet-popup.js — the bullet style popup (character, colour, in-use combos, reset).
// Mixed into RaggedLinksController; methods use the controller via `this`.

import { DEFAULT_BULLET, BULLET_PALETTE } from './bullets.js';

export const bulletPopupMethods = {
  _createPopup() {
    this.popup = document.createElement('div');
    this.popup.className = 'bullet-popup';
    this.popup.hidden = true;
    document.body.appendChild(this.popup);

    const closeOnOutside = (e) => {
      if (this.popup.hidden) return;
      if (this._openedAt && Date.now() - this._openedAt < 250) return;
      if (this.popup.contains(e.target)) return;
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      const hitLi = e.target.closest?.('.canvas-list li');
      if (hitLi && hitLi === this.targetLi && clientX !== undefined && this._isBulletHit(clientX, clientY, hitLi)) {
        return;
      }
      this.closePopup();
    };

    document.addEventListener('click', closeOnOutside);
    document.addEventListener('touchstart', closeOnOutside, { passive: true });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.popup.hidden) {
        this.closePopup();
      }
    });
  },

  openPopup(anchorLi) {
    if (this.targetLi === anchorLi && !this.popup.hidden && this._openedAt && Date.now() - this._openedAt > 150) {
      this.closePopup();
      return;
    }
    this.targetLi = anchorLi;
    this._openedAt = Date.now();
    const currentBullet = anchorLi.getAttribute('data-bullet') || DEFAULT_BULLET;
    const currentColor = anchorLi.getAttribute('data-color') || '';
    const currentBg = anchorLi.style?.getPropertyValue ? anchorLi.style.getPropertyValue('--row-bg') : '';
    const currentFg = anchorLi.style?.getPropertyValue ? anchorLi.style.getPropertyValue('--row-fg') : '';
    const currentAssoc = anchorLi.getAttribute('data-assoc') || '';

    const availablePresets = this.getAvailablePresets();
    const inUseCombos = this.getInUseCombinations();
    const linkedRows = this.getLinkedRows(anchorLi);
    const hasStyleOrAssoc = (currentBullet && currentBullet !== DEFAULT_BULLET) || currentColor || currentBg || currentAssoc;

    this.popup.innerHTML = `
      <div class="bullet-popup-title">Bullet Character</div>
      <input type="text" class="bullet-input" maxlength="4" value="${currentBullet === DEFAULT_BULLET ? '' : currentBullet}" placeholder="Type any character/emoji">
      
      <div class="bullet-popup-title">Available</div>
      <div class="bullet-chip-grid available-chips">
        ${availablePresets.length > 0
          ? availablePresets.map(p => `
            <button type="button" 
                    class="bullet-chip-btn" 
                    data-color="${p.color}"
                    data-bullet="${p.bullet}"
                    data-bg="${p.bg}"
                    data-fg="${p.fg}"
                    title="${p.name} (${p.color})">
              ${p.bullet}
            </button>`).join('')
          : '<span class="bullet-empty-note">All presets in use</span>'
        }
      </div>

      <div class="bullet-popup-title">Block Color</div>
      <div class="bullet-swatch-row">
        ${BULLET_PALETTE.map(p => `
          <button type="button" class="bullet-swatch-btn ${p.id === 'clear' ? 'clear-swatch' : ''}" 
                  title="${p.name}" 
                  style="background: ${p.bg}; border-color: ${p.fg};" 
                  data-color="${p.id}"
                  data-bg="${p.bg}" 
                  data-fg="${p.fg}">
          </button>
        `).join('')}
      </div>

      <div class="bullet-popup-title">In Use</div>
      <div class="bullet-chip-grid in-use-chips">
        ${inUseCombos.length > 0
          ? inUseCombos.map(c => {
              const isActive = c.bullet === currentBullet && (c.color === currentColor || (!c.color && c.bg === currentBg));
              return `
                <button type="button" 
                        class="bullet-chip-btn ${isActive ? 'active' : ''}" 
                        data-color="${c.color || ''}"
                        data-bullet="${c.bullet}"
                        data-bg="${c.bg || ''}"
                        data-fg="${c.fg || ''}"
                        data-assoc="${c.assocId || ''}"
                        style="${c.bg ? `background: ${c.bg};` : ''} ${c.fg ? `color: ${c.fg}; border-color: ${c.fg};` : ''}"
                        title="${c.bullet} ${c.color ? `(${c.color})` : ''} — ${c.count} in use">
                  ${c.bullet}
                </button>
              `;
            }).join('')
          : '<span class="bullet-empty-note">No bullets in use yet</span>'
        }
      </div>

      ${hasStyleOrAssoc ? `
        <hr class="bullet-popup-divider">
        <div class="bullet-popup-actions">
          <button type="button" class="bullet-reset-btn" data-action="reset-item" title="Reset this item back to default bullet and clear styling">
            ✕ Remove style &amp; association
          </button>
          ${linkedRows.length > 1 ? `
          <button type="button" class="bullet-reset-btn bullet-reset-all" data-action="reset-all" title="Remove style and association from all ${linkedRows.length} linked items">
            ✕ Remove from all ${linkedRows.length} linked items
          </button>
          ` : ''}
        </div>
      ` : ''}
    `;

    // Position anchored near bullet area of anchorLi, staying within viewport
    const rect = anchorLi.getBoundingClientRect();
    const popupHeight = 320;
    let top = rect.bottom + window.scrollY + 6;
    if (rect.bottom + popupHeight > window.innerHeight && rect.top > popupHeight) {
      top = rect.top + window.scrollY - popupHeight - 6;
    }
    const maxLeft = Math.max(10, window.innerWidth - 300);
    const left = Math.min(Math.max(10, rect.left + window.scrollX), maxLeft);
    this.popup.style.top = `${top}px`;
    this.popup.style.left = `${left}px`;
    this.popup.hidden = false;

    // Character input event
    const input = this.popup.querySelector('.bullet-input');
    input.focus();
    input.select();
    input.addEventListener('input', () => {
      const val = input.value.trim() || DEFAULT_BULLET;
      const curBg = this.targetLi.style?.getPropertyValue ? this.targetLi.style.getPropertyValue('--row-bg') : '';
      const curFg = this.targetLi.style?.getPropertyValue ? this.targetLi.style.getPropertyValue('--row-fg') : '';
      const curColor = this.targetLi.getAttribute('data-color');
      this.applyStyleToLinked(this.targetLi, val, curBg, curFg, curColor);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.closePopup();
      }
    });

    // Available presets click (main menu list)
    this.popup.querySelectorAll('.available-chips .bullet-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bullet = btn.dataset.bullet;
        const color = btn.dataset.color;
        const bg = btn.dataset.bg;
        const fg = btn.dataset.fg;
        this.applyStyleToLinked(this.targetLi, bullet, bg, fg, color);
        this.addRecentBullet(bullet);
        this.closePopup();
      });
    });

    // In-use combinations click (at end of menu)
    this.popup.querySelectorAll('.in-use-chips .bullet-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bullet = btn.dataset.bullet;
        const color = btn.dataset.color;
        const bg = btn.dataset.bg;
        const fg = btn.dataset.fg;
        const assocId = btn.dataset.assoc || null;
        this.applyStyleToLinked(this.targetLi, bullet, bg, fg, color, assocId);
        this.addRecentBullet(bullet);
        this.closePopup();
      });
    });

    // Color swatch click
    this.popup.querySelectorAll('.bullet-swatch-btn').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const bg = swatch.dataset.bg;
        const fg = swatch.dataset.fg;
        const color = swatch.dataset.color;
        const char = input.value.trim() || this.targetLi.getAttribute('data-bullet') || DEFAULT_BULLET;
        if (color === 'clear') {
          if (char === DEFAULT_BULLET) {
            this.clearRowStyle(this.targetLi);
          } else {
            this.applyStyleToLinked(this.targetLi, char, '', '', '');
          }
        } else {
          this.applyStyleToLinked(this.targetLi, char, bg, fg, color);
        }
        this.closePopup();
      });
    });

    // Reset action buttons
    const resetItemBtn = this.popup.querySelector('[data-action="reset-item"]');
    if (resetItemBtn) {
      resetItemBtn.addEventListener('click', () => {
        this.clearRowStyle(this.targetLi);
        this.closePopup();
      });
    }

    const resetAllBtn = this.popup.querySelector('[data-action="reset-all"]');
    if (resetAllBtn) {
      resetAllBtn.addEventListener('click', () => {
        this.clearCluster(this.targetLi);
        this.closePopup();
      });
    }
  },

  closePopup() {
    this.popup.hidden = true;
    this.targetLi = null;
  }
};
