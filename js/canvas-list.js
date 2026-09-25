// The "Your canvases" page, shown in place of the canvas grid: every canvas
// the signed-in user can open, most recently edited first. app.js decides
// when (always at /canvases; at / only when there's more than one).
import { setInBin, emptyBin } from './canvas-data.js';
import { signOutUser, firstName } from './auth.js';

const SECTION_IDS = ['kp', 'ka', 'vp', 'bs', 'be', 'kr', 'de', 'mb', 'if'];
const SHARED_LABELS = { editor: 'Shared with you', viewer: 'Shared with you · view only' };
const TRASH_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

// Firestore Timestamps, or a Date for a canvas binned since the list loaded.
const dateOf = (t) => (t instanceof Date ? t : t?.toDate?.());
const bin = () => document.getElementById('canvas-bin-items');

function ago(date) {
  if (!date) return '';
  const minutes = Math.round((date - Date.now()) / 60000);
  if (minutes > -1) return 'just now';
  if (minutes > -60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (days > -7) return relative.format(days, 'day');
  return `on ${date.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
}

function enterListView() {
  document.getElementById('app-root').hidden = true;
  document.getElementById('canvas-list').hidden = false;
  document.title = 'Your canvases · MMC';
}

function wireAccount(user) {
  document.getElementById('canvas-list-user').textContent = `Signed in as ${firstName(user)}.`;
  document.getElementById('canvas-list-signout').addEventListener('click', async () => {
    await signOutUser();
    window.location.reload();
  });
}

function updateEmptyNote() {
  document.getElementById('canvas-list-empty').hidden = document.getElementById('canvas-list-items').children.length > 0;
  document.getElementById('canvas-bin').hidden = bin().children.length === 0;
  document.getElementById('canvas-bin-count').textContent = bin().children.length;
}

// Moving to the bin can be undone, so it doesn't ask first; emptying it does.
function binButton(canvas, title, row, uid) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-btn canvas-card-delete';
  button.title = 'Move to bin';
  button.setAttribute('aria-label', title ? `Move “${title}” to the bin` : 'Move untitled canvas to the bin');
  button.innerHTML = TRASH_ICON;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await setInBin(canvas.id, true);
      (row.nextElementSibling ?? row.previousElementSibling)?.querySelector('a')?.focus();
      row.remove();
      bin().prepend(canvasRow({ ...canvas, binnedAt: new Date() }, uid));
      updateEmptyNote();
    } catch (err) {
      button.disabled = false;
      alert(`Couldn't move the canvas to the bin: ${err.message}`);
    }
  });
  return button;
}

function restoreButton(canvas, title, row, uid) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link-btn canvas-card-restore';
  button.textContent = 'Restore';
  button.setAttribute('aria-label', title ? `Restore “${title}”` : 'Restore untitled canvas');
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await setInBin(canvas.id, false);
      (row.nextElementSibling ?? row.previousElementSibling)?.querySelector('button')?.focus();
      row.remove();
      document.getElementById('canvas-list-items').prepend(canvasRow({ ...canvas, binnedAt: null }, uid));
      updateEmptyNote();
    } catch (err) {
      button.disabled = false;
      alert(`Couldn't restore the canvas: ${err.message}`);
    }
  });
  return button;
}

function wireEmptyBin() {
  const button = document.getElementById('canvas-bin-empty');
  button.addEventListener('click', async () => {
    const count = bin().children.length;
    const them = count === 1 ? 'it' : 'them';
    if (!confirm(`Delete ${count === 1 ? 'the canvas' : `all ${count} canvases`} in the bin for good? This can't be undone, and anyone you shared ${them} with loses ${them} too.`)) return;
    button.disabled = true;
    try {
      await emptyBin();
      bin().replaceChildren();
      updateEmptyNote();
    } catch (err) {
      alert(`Couldn't empty the bin: ${err.message}`);
    } finally {
      button.disabled = false;
    }
  });
}

function canvasRow(canvas, uid) {
  const fields = canvas.fields || {};
  const title = fields.title?.trim();
  const author = fields.by?.trim();
  const filled = SECTION_IDS.filter((id) => fields[id]?.trim());
  const blank = !title && !author && filled.length === 0;
  const role = canvas.roles?.[uid];

  // Miniature of the canvas layout; shaded cells have writing in them.
  const thumb = document.createElement('span');
  thumb.className = 'canvas-thumb';
  thumb.setAttribute('role', 'img');
  thumb.setAttribute('aria-label', `${filled.length} of ${SECTION_IDS.length} sections written`);
  for (const id of SECTION_IDS) {
    const cell = document.createElement('i');
    cell.style.gridArea = id;
    cell.classList.toggle('filled', filled.includes(id));
    thumb.append(cell);
  }

  const name = document.createElement('span');
  name.className = 'canvas-card-title';
  name.classList.toggle('untitled', !title);
  name.textContent = title || 'Untitled canvas';

  const binnedAt = dateOf(canvas.binnedAt);
  const when = ago(binnedAt ?? dateOf(canvas.updatedAt));
  const meta = document.createElement('span');
  meta.className = 'canvas-card-meta';
  meta.textContent = [
    author,
    blank && 'Empty',
    when && `${binnedAt ? 'Binned' : blank ? 'Created' : 'Edited'} ${when}`,
    SHARED_LABELS[role]
  ].filter(Boolean).join(' · ');

  const text = document.createElement('span');
  text.className = 'canvas-card-text';
  text.append(name, meta);

  const link = document.createElement('a');
  link.className = 'canvas-card-link';
  link.href = `/canvas/${canvas.id}`;
  link.append(thumb, text);

  const row = document.createElement('li');
  row.className = 'canvas-card';
  row.append(link);
  // Same owner test as firestore.rules' isCanvasOwner.
  if (canvas.ownerId === uid) {
    row.append(binnedAt ? restoreButton(canvas, title, row, uid) : binButton(canvas, title, row, uid));
  }
  return row;
}

/** Shows the page straight away with placeholder rows, before sign-in and
 * the canvas query have finished. */
export function showCanvasListSkeleton() {
  const items = document.getElementById('canvas-list-items');
  items.replaceChildren(...[1, 2, 3].map(() => {
    const row = document.createElement('li');
    row.className = 'canvas-card';
    row.dataset.skeleton = '';
    return row;
  }));
  enterListView();
}

/** Canvases someone else has binned are left out: only their owner sees
 * them, in the bin. */
export function showCanvasList(canvases, user) {
  const items = document.getElementById('canvas-list-items');
  const binned = canvases.filter((c) => c.binnedAt && c.ownerId === user.uid)
    .sort((a, b) => dateOf(b.binnedAt) - dateOf(a.binnedAt));
  items.replaceChildren(...canvases.filter((c) => !c.binnedAt).map((canvas) => canvasRow(canvas, user.uid)));
  bin().replaceChildren(...binned.map((canvas) => canvasRow(canvas, user.uid)));
  items.setAttribute('aria-busy', 'false');
  updateEmptyNote();
  wireAccount(user);
  wireEmptyBin();
  enterListView();
}

export function showCanvasListError(user) {
  const items = document.getElementById('canvas-list-items');
  items.replaceChildren();
  items.setAttribute('aria-busy', 'false');
  document.getElementById('canvas-list-error').hidden = false;
  wireAccount(user);
  enterListView();
}
