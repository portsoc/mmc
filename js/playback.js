// WP07 — Version history playback, driven off the version history already
// written by js/versions.js. Steps through every saved version (named and
// daily), oldest first, and always finishes on the live canvas.
import { listVersions } from './versions.js';
import { FIELD_IDS } from './canvas-data.js';
import { ensureBullets } from './ragged-links.js';

const SPEED_MS = { 1: 1200, 2: 600, 5: 250 };

export class PlaybackController {
  /** getLiveFields() returns the current canvas text, shown at liveIndex. */
  constructor(canvasId, elementsById, getLiveFields, raggedLinks = null, getLiveItems = null) {
    this.canvasId = canvasId;
    this.elementsById = elementsById;
    this.getLiveFields = getLiveFields;
    this.raggedLinks = raggedLinks;
    this.getLiveItems = getLiveItems;
    this.versions = [];
    this.currentIndex = 0;
    this.speed = 1;
    this.timer = null;
    this.onStep = null; // (index, version | null for live) => void
    this.onPlayingChange = null; // (playing) => void
    this.diffHighlight = true;
  }

  get liveIndex() {
    return this.versions.length;
  }

  get playing() {
    return this.timer !== null;
  }

  async load() {
    this.versions = await listVersions(this.canvasId);
    this.currentIndex = this.liveIndex;
    return this.versions.length;
  }

  versionAt(index) {
    return index < this.versions.length ? this.versions[index] : null;
  }

  render(index) {
    const version = this.versionAt(index);
    const fields = version ? version.fields : this.getLiveFields();
    const items = version ? version.items : this.getLiveItems?.();
    for (const fieldId of FIELD_IDS) {
      const el = this.elementsById[fieldId];
      if (!el) continue;
      const rawText = fields?.[fieldId] ?? '';
      if (['title', 'by'].includes(fieldId)) {
        if (el.textContent !== rawText) {
          el.textContent = rawText;
          if (this.diffHighlight) flash(el);
        }
      } else {
        const formatted = ensureBullets(rawText);
        const current = this.raggedLinks ? this.raggedLinks.serializeSection(el) : el.textContent;
        if (current !== formatted) {
          if (this.raggedLinks) {
            if (items?.[fieldId]) {
              this.raggedLinks.setSectionItems(el, items[fieldId]);
            } else {
              this.raggedLinks.setSectionText(el, formatted);
            }
          } else {
            el.textContent = formatted;
          }
          if (this.diffHighlight) flash(el);
        }
      }
    }
    this.currentIndex = index;
    this.onStep?.(index, version);
  }

  seek(index) {
    this.render(Math.max(0, Math.min(index, this.liveIndex)));
  }

  play() {
    this.pause();
    if (this.currentIndex >= this.liveIndex) this.render(0);
    this.timer = setInterval(() => {
      this.render(this.currentIndex + 1);
      if (this.currentIndex >= this.liveIndex) this.pause();
    }, SPEED_MS[this.speed] || 1200);
    this.onPlayingChange?.(true);
  }

  pause() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.onPlayingChange?.(false);
  }

  setSpeed(speed) {
    this.speed = speed;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.play();
    }
  }
}

function flash(el) {
  el.classList.remove('diff-flash');
  void el.offsetWidth; // restart the animation if it's already running
  el.classList.add('diff-flash');
  setTimeout(() => el.classList.remove('diff-flash'), 900);
}
