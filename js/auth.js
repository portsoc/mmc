// WP02 — Authentication & user profile bootstrap.
import { auth, db } from './firebase-config.js';
import {
  GoogleAuthProvider,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

export const currentUser = { value: null };
const listeners = new Set();

export function onUser(callback) {
  listeners.add(callback);
  if (currentUser.value) callback(currentUser.value);
  return () => listeners.delete(callback);
}

/** Short name shown to collaborators: first word of the Google name, else
 * the first part of the email (rich.boakes@… → Rich), never the address. */
export function firstName(user) {
  const full = user?.displayName || user?.providerData?.find((p) => p.displayName)?.displayName;
  if (full?.trim()) return full.trim().split(/\s+/)[0];
  const local = user?.email?.split('@')[0].split(/[._+-]/)[0];
  return local ? local[0].toUpperCase() + local.slice(1) : 'Guest';
}

function notify() {
  for (const cb of listeners) cb(currentUser.value);
}

async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || 'Signed-in user',
      email: user.email || null,
      createdAt: serverTimestamp()
    });
  }
}

/** Resolves once Firebase has reported the initial auth state (user or null).
 * Unlike the old anonymous-first model, an unauthenticated visitor stays
 * unauthenticated — callers gate editing on currentUser.value being set.
 *
 * Also checks getRedirectResult() first: signInWithGoogle() below navigates
 * away and back (redirect flow, not a popup — see note there), so the user
 * this resolves with may be the one who just completed that round trip. */
export async function initAuth() {
  await getRedirectResult(auth).catch((err) => {
    console.warn('[auth] Redirect sign-in failed:', err.message);
  });
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          await ensureUserProfile(user);
        } catch (err) {
          console.warn('[auth] ensureUserProfile failed, continuing signed in:', err.message);
        }
        currentUser.value = user;
      } else {
        currentUser.value = null;
      }
      notify();
      unsubscribe();
      resolve(currentUser.value);
    });
  });
}

/** Navigates to Google's sign-in page and back (signInWithRedirect), rather
 * than a popup: popups are silently swallowed with no error by some browser
 * popup-blocker/third-party-cookie configurations, which made sign-in look
 * like a dead button with no feedback at all. Redirect has no such failure
 * mode. Does not return the credential directly — initAuth()'s
 * getRedirectResult() call on the next page load picks it up instead. */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
}

// Browser tests (test/e2e) can't click through Google's page, so on localhost
// only they sign in with a fake Google credential, which the Auth emulator accepts.
if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  window.__mmcTestSignIn = (email, name) => signInWithCredential(auth,
    GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, name, email_verified: true })));
}

export async function signOutUser() {
  await signOut(auth);
  currentUser.value = null;
  notify();
}
