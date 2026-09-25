// Version history sidebar (menu → Version history / Name this version).
import { currentUser } from './auth.js';
import { applyLocalItems, itemsFromY, setDomSyncPaused, setFieldTexts } from './collab.js';
import { restoreVersion } from './versions.js';
import { PlaybackController } from './playback.js';
import { itemsToPlainText } from './item-migration.js';
import { state, prefs, elementsById } from './app-state.js';

function formatVersionDate(version) {
  const date = version.createdAt?.toDate?.();
  return date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : version.dateKey || '';
}

/** Version history sidebar: lists every saved version newest first, shows
 * the selected one on the canvas (read-only), plays them in order, and lets
 * the owner restore one. Closing always returns the canvas to live text. */
export function wireHistory() {
  const dock = document.getElementById('history-dock');
  const list = document.getElementById('history-list');
  const status = document.getElementById('history-status');
  const playBtn = document.getElementById('history-play');
  const pauseBtn = document.getElementById('history-pause');
  const restoreBar = document.getElementById('history-selected-actions');
  const els = elementsById();
  let controller = null;
  let liveSnapshot = null; // read-only views have no shared doc to read live text from
  let liveItemsSnapshot = null;

  function liveItems() {
    if (!state.collab) return liveItemsSnapshot;
    return Object.fromEntries(Object.entries(state.collab.yItems).map(([f, yarr]) => [f, itemsFromY(yarr)]));
  }

  function liveFields() {
    if (!state.collab) return liveSnapshot;
    const fields = Object.fromEntries(Object.entries(state.collab.yFields).map(([f, ytext]) => [f, ytext.toString()]));
    for (const [f, items] of Object.entries(liveItems())) fields[f] = itemsToPlainText(items);
    return fields;
  }

  function setEditable(editable) {
    for (const el of Object.values(els)) el?.setAttribute('contenteditable', editable ? 'plaintext-only' : 'false');
  }

  function renderList() {
    list.replaceChildren();
    for (let i = controller.liveIndex; i >= 0; i--) {
      const version = controller.versionAt(i);
      const li = document.createElement('li');
      li.dataset.index = String(i);
      li.tabIndex = 0;
      const name = document.createElement('span');
      name.className = 'history-name';
      const meta = document.createElement('span');
      meta.className = 'history-meta';
      if (!version) {
        name.textContent = 'Current version';
        meta.textContent = 'Live';
      } else if (version.type === 'manual') {
        li.classList.add('named');
        name.textContent = version.name;
        meta.textContent = [formatVersionDate(version), version.createdBy?.name].filter(Boolean).join(' · ');
        if (version.description) li.title = version.description;
      } else {
        name.textContent = 'Daily snapshot';
        meta.textContent = version.dateKey;
      }
      li.append(name, meta);
      li.addEventListener('click', () => {
        controller.pause();
        controller.seek(i);
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          li.click();
        }
      });
      list.appendChild(li);
    }
  }

  function onStep(index, version) {
    for (const li of list.children) li.classList.toggle('current', Number(li.dataset.index) === index);
    list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
    status.textContent = version ? 'Viewing an earlier version (read-only)' : 'Showing the current version';
    restoreBar.hidden = !version || !state.isOwner || !state.collab;
    state.raggedLinks?.update();
  }

  async function open() {
    liveSnapshot = Object.fromEntries(Object.entries(els).map(([f, el]) => [
      f,
      ['title', 'by'].includes(f) ? (el?.textContent ?? '') : (state.raggedLinks?.serializeSection(el) ?? (el?.textContent ?? ''))
    ]));
    liveItemsSnapshot = state.raggedLinks
      ? Object.fromEntries(Object.entries(els).filter(([f]) => !['title', 'by'].includes(f))
        .map(([f, el]) => [f, state.raggedLinks.serializeSectionItems(el)]))
      : null;
    controller = new PlaybackController(state.canvasId, els, liveFields, state.raggedLinks, liveItems);
    controller.onStep = onStep;
    controller.onPlayingChange = (playing) => {
      playBtn.hidden = playing;
      pauseBtn.hidden = !playing;
    };
    await controller.load();
    document.activeElement?.blur?.();
    setDomSyncPaused(true);
    setEditable(false);
    renderList();
    onStep(controller.liveIndex, null);
    dock.hidden = false;
    document.body.classList.add('history-active');
  }

  function close() {
    if (!controller) return;
    controller.pause();
    controller.diffHighlight = false;
    controller.seek(controller.liveIndex);
    setDomSyncPaused(false);
    if (!state.readOnly) setEditable(true);
    dock.hidden = true;
    document.body.classList.remove('history-active');
    controller = null;
    state.raggedLinks?.update();
  }

  document.getElementById('history-btn')?.addEventListener('click', () => {
    if (state.canvasId) (dock.hidden ? open() : close());
  });
  document.getElementById('history-exit')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && controller && !document.querySelector('dialog[open]')) close();
  });
  playBtn.addEventListener('click', () => {
    controller.diffHighlight = prefs.flashChanges;
    controller.setSpeed(prefs.playbackSpeed);
    controller.play();
  });
  pauseBtn.addEventListener('click', () => controller?.pause());
  document.getElementById('history-restore')?.addEventListener('click', async () => {
    const version = controller?.versionAt(controller.currentIndex);
    if (!version || !state.collab) return;
    const label = version.type === 'manual' ? `"${version.name}"` : `the snapshot from ${version.dateKey}`;
    if (!confirm(`Restore ${label}? The current canvas is saved as a version first, so this can be undone.`)) return;
    const restored = await restoreVersion(state.canvasId, version.id, currentUser.value);
    const restoredFields = restored?.fields || version.fields;
    const restoredItems = restored?.items || version.items;
    const headerTexts = Object.fromEntries(Object.entries(restoredFields).filter(([f]) => ['title', 'by'].includes(f)));
    setFieldTexts(state.collab.ydoc, state.collab.yFields, headerTexts, state.collab.provider._localOrigin);
    for (const [fieldId, text] of Object.entries(restoredFields)) {
      const el = els[fieldId];
      if (!el) continue;
      if (['title', 'by'].includes(fieldId)) {
        el.textContent = text;
      } else if (state.raggedLinks) {
        if (restoredItems?.[fieldId]) {
          state.raggedLinks.setSectionItems(el, restoredItems[fieldId]);
        } else {
          state.raggedLinks.setSectionText(el, text);
        }
        applyLocalItems(state.collab, fieldId, state.raggedLinks.serializeSectionItems(el));
      }
    }
    close();
  });

  return {
    async reload() {
      if (!controller) return;
      await controller.load();
      renderList();
      controller.seek(controller.liveIndex);
    }
  };
}
