// Toolbar menu and its dialogs: settings, diagnostics, share & invite,
// and "name this version". Each wire* function is called once from init().
import { currentUser, onUser, signOutUser, firstName } from './auth.js';
import {
  getCanvas,
  createInvite,
  listInvites,
  readOnlyUrlFor,
  inviteUrlFor,
  setPublicReadOnly
} from './canvas-data.js';
import { createWaypoint } from './versions.js';
import { errorReporter } from './error-reporter.js';
import { toastManager } from './feedback.js';
import { state, prefs, savePrefs } from './app-state.js';
import { refreshContributorHighlight } from './contributors.js';

async function renderCollaboratorList() {
  const list = document.getElementById('collaborator-list');
  if (!list || !state.canvasId) return;
  list.innerHTML = '';

  const canvas = await getCanvas(state.canvasId);
  for (const [uid, role] of Object.entries(canvas?.roles || {})) {
    const item = document.createElement('li');
    const name = uid === currentUser.value?.uid ? 'You' : canvas.memberNames?.[uid] || 'Unnamed collaborator';
    item.textContent = `${name} — ${role}`;
    list.appendChild(item);
  }

  const invites = await listInvites(state.canvasId);
  for (const invite of invites.filter((i) => i.status === 'pending')) {
    const item = document.createElement('li');
    item.className = 'invite-pending';
    item.textContent = `${invite.email || 'Invite link'} — ${invite.role} (not used yet)`;
    list.appendChild(item);
  }
}

export function wireSettings() {
  const modal = document.getElementById('settings-modal');
  const account = document.getElementById('settings-account');
  const signoutBtn = document.getElementById('settings-signout');
  const highlight = document.getElementById('pref-highlight-contributors');
  const flash = document.getElementById('pref-flash-changes');
  const dim = document.getElementById('pref-dim-unfocused');
  const speed = document.getElementById('pref-playback-speed');

  onUser((user) => {
    account.textContent = user
      ? `Signed in as ${firstName(user)}`
      : 'Not signed in';
    signoutBtn.hidden = !user;
  });

  highlight.checked = prefs.highlightContributors;
  flash.checked = prefs.flashChanges;
  dim.checked = prefs.dimUnfocused;
  document.body.classList.toggle('dim-unfocused', prefs.dimUnfocused);
  speed.value = String(prefs.playbackSpeed);

  document.getElementById('settings-btn')?.addEventListener('click', () => modal.showModal());
  document.getElementById('settings-close')?.addEventListener('click', () => modal.close());
  signoutBtn.addEventListener('click', async () => {
    await signOutUser();
    window.location.reload();
  });
  highlight.addEventListener('change', () => {
    prefs.highlightContributors = highlight.checked;
    savePrefs();
    refreshContributorHighlight();
  });
  dim.addEventListener('change', () => {
    prefs.dimUnfocused = dim.checked;
    savePrefs();
    document.body.classList.toggle('dim-unfocused', dim.checked);
  });
  flash.addEventListener('change', () => {
    prefs.flashChanges = flash.checked;
    savePrefs();
  });
  speed.addEventListener('change', () => {
    prefs.playbackSpeed = Number(speed.value);
    savePrefs();
  });
}

export function wireDiagnosticsModal() {
  const modal = document.getElementById('diagnostics-modal');
  const pre = document.getElementById('diagnostics-text');
  const copyBtn = document.getElementById('diagnostics-copy');
  const clearBtn = document.getElementById('diagnostics-clear');
  const closeBtn = document.getElementById('diagnostics-close');

  function openDiagnostics() {
    if (pre) pre.textContent = errorReporter.formatDiagnostics();
    if (modal && typeof modal.showModal === 'function') modal.showModal();
  }

  document.getElementById('diagnostics-btn')?.addEventListener('click', openDiagnostics);
  document.getElementById('settings-diagnostics')?.addEventListener('click', () => {
    document.getElementById('settings-modal')?.close();
    openDiagnostics();
  });

  closeBtn?.addEventListener('click', () => modal?.close());
  clearBtn?.addEventListener('click', () => {
    errorReporter.clearLogs();
    if (pre) pre.textContent = errorReporter.formatDiagnostics();
    toastManager.info('Diagnostic logs cleared');
  });
  copyBtn?.addEventListener('click', async () => {
    const text = errorReporter.formatDiagnostics();
    try {
      await navigator.clipboard.writeText(text);
      toastManager.success('Diagnostics copied to clipboard');
    } catch {
      toastManager.info('Could not auto-copy. Select and copy from the text box.');
    }
  });

  return { openDiagnostics };
}

export function wireAppMenu() {
  const menuBtn = document.getElementById('menu-btn');
  const menu = document.getElementById('app-menu');
  if (!menuBtn || !menu) return;

  function setOpen(open) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }

  menuBtn.addEventListener('click', () => {
    const opening = menu.hidden;
    setOpen(opening);
    // Keyboard users land on the first item; Tab then walks the list.
    if (opening) menu.querySelector('.app-menu-item:not([hidden])')?.focus({ preventScroll: true });
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) setOpen(false);
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('.app-menu-item')) setOpen(false);
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); // don't also trigger the page-level Escape handling
    setOpen(false);
    menuBtn.focus();
  });
  // Tabbing out of the menu closes it rather than leaving it floating open.
  menu.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !menu.contains(e.relatedTarget) && e.relatedTarget !== menuBtn) setOpen(false);
  });
}

export function wireShareModal() {
  const modal = document.getElementById('share-modal');
  document.getElementById('share-btn')?.addEventListener('click', async () => {
    if (!state.canvasId) return;
    const canvas = await getCanvas(state.canvasId);
    document.getElementById('share-readonly-url').value = readOnlyUrlFor(canvas.readOnlyToken);
    document.getElementById('share-public-toggle').checked = !!canvas.isPublicReadOnlyEnabled;
    document.getElementById('invite-result').hidden = true;
    await renderCollaboratorList();
    modal.showModal();
  });
  document.getElementById('share-copy-link')?.addEventListener('click', () => {
    const input = document.getElementById('share-readonly-url');
    input.select();
    navigator.clipboard?.writeText(input.value);
  });
  document.getElementById('share-public-toggle')?.addEventListener('change', async (e) => {
    if (!state.canvasId) return;
    await setPublicReadOnly(state.canvasId, e.target.checked);
  });
  document.getElementById('invite-send')?.addEventListener('click', async () => {
    const email = document.getElementById('invite-email').value.trim();
    const role = document.getElementById('invite-role').value;
    if (!state.canvasId) return;
    const inviteToken = await createInvite(state.canvasId, currentUser.value.uid, email, role);
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-url').value = inviteUrlFor(state.canvasId, inviteToken);
    document.getElementById('invite-result').hidden = false;
    await renderCollaboratorList();
  });
  document.getElementById('invite-copy')?.addEventListener('click', () => {
    const input = document.getElementById('invite-url');
    input.select();
    navigator.clipboard?.writeText(input.value);
  });
  document.getElementById('share-close')?.addEventListener('click', () => modal.close());
}

export function wireNameVersion(onSaved) {
  const modal = document.getElementById('name-version-modal');
  const nameInput = document.getElementById('version-name');
  const noteInput = document.getElementById('version-note');
  const saveBtn = document.getElementById('name-version-save');

  document.getElementById('name-version-btn')?.addEventListener('click', () => {
    nameInput.value = '';
    noteInput.value = '';
    modal.showModal();
    nameInput.focus();
  });
  document.getElementById('name-version-cancel')?.addEventListener('click', () => modal.close());
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
  });
  saveBtn.addEventListener('click', async () => {
    if (!state.canvasId) return;
    saveBtn.disabled = true;
    try {
      const name = nameInput.value.trim() || 'Untitled version';
      await createWaypoint(state.canvasId, name, noteInput.value.trim(), currentUser.value);
      modal.close();
      onSaved?.();
    } finally {
      saveBtn.disabled = false;
    }
  });
}
