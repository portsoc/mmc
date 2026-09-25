// WP01 — Firebase initialization. Loaded as an ES module (see index.html).
// Auto-detects localhost and routes to the Emulator Suite so no cloud
// charges or real credentials are needed during development.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  getFirestore,
  connectFirestoreEmulator
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  getDatabase,
  connectDatabaseEmulator,
  ref,
  onValue
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js';
import { getFunctions, connectFunctionsEmulator } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js';

const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const firebaseConfig = {
  apiKey: 'AIzaSyDLnXxb0Ar1nwUGEEg3AsQs_F5DWFfdtZw',
  // Must be the domain the page is served from: signInWithRedirect's result
  // is stored on authDomain, and browsers partition that storage when it's a
  // different site, so getRedirectResult() silently comes back null.
  // Firebase Hosting serves /__/auth/handler on every site, so this works for
  // mmcedit.web.app and mmceditor.web.app alike.
  authDomain: isLocalhost ? 'mission-mmc-4476.firebaseapp.com' : window.location.host,
  projectId: 'mission-mmc-4476',
  storageBucket: 'mission-mmc-4476.firebasestorage.app',
  messagingSenderId: '927658295742',
  appId: '1:927658295742:web:46540d3ff8dfe3375f39ef',
  databaseURL: 'https://mission-mmc-4476-default-rtdb.firebaseio.com'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

function initFirestoreResilient(firebaseApp) {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      }),
      experimentalAutoDetectLongPolling: true
    });
  } catch (err) {
    console.warn('[firebase-config] Failed to initialize persistentLocalCache, falling back:', err);
    try {
      return initializeFirestore(firebaseApp, {
        localCache: memoryLocalCache()
      });
    } catch {
      return getFirestore(firebaseApp);
    }
  }
}

export const db = initFirestoreResilient(app);
export const rtdb = getDatabase(app);
export const functions = getFunctions(app);

/**
 * Listens to Realtime Database connection status via .info/connected.
 * @param {(connected: boolean) => void} callback
 * @returns {() => void} unsubscribe function
 */
export function onRtdbConnectionChange(callback) {
  try {
    const connectedRef = ref(rtdb, '.info/connected');
    return onValue(connectedRef, (snap) => {
      callback(snap.val() === true);
    }, (err) => {
      console.warn('[firebase-config] RTDB connection listener error:', err);
      callback(false);
    });
  } catch (err) {
    console.warn('[firebase-config] Failed to setup RTDB connection listener:', err);
    return () => {};
  }
}

if (isLocalhost) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
  connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  console.info('[firebase-config] Connected to local Emulator Suite');
}

