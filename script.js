const el = {};
const mmc = {
  current: []
};

function toggleItem(event) {
  event.preventDefault();
  const gridItem = event.target.closest('.grid-item');
  if (event.metaKey || event.shiftKey) {
    gridItem?.classList.toggle('lo');
  }

  const editableChild = gridItem.querySelector('[contenteditable]');
  if (editableChild) {
    editableChild.focus();
  }
  updateURL()
}

function updateURL() {
  const inverseIds = [];
  for (const element of document.querySelectorAll('.grid-item')) {
    if (!element.classList.contains('lo')) {
      inverseIds.push(element.id);
    }
  }
  let fragment = ''
  if (inverseIds.length > 0 && inverseIds.length < 9) {
    fragment = inverseIds.join('-');
  }
  setFragment(fragment);
}

function setFragment(fragment) {
  const url = `${window.location.pathname}${window.location.search}#${fragment}`;
  window.history.replaceState(null, null, url);
}

function saveContent() {
  // save time
  mmc.current = [];
  for (const element of el.editableElements) {
    const parentWithId = element.closest('[id]');
    if (parentWithId) {
      mmc.current.push({
        id: parentWithId.id,
        content: element.innerHTML
      });
    }
  }
  localStorage.setItem('mmc', JSON.stringify(mmc));
}


function loadContent() {
  const mmcString = localStorage.getItem('mmc');
  if (mmcString) {
    Object.assign(mmc, JSON.parse(mmcString));
    for (const element of el.editableElements) {
      const parentWithId = element.closest('[id]');
      if (parentWithId) {
        const item = mmc.current.find(item => item.id === parentWithId.id);
        if (item) {
          element.innerHTML = item.content;
        }
      }
    }
  }

  handleFragment();
}

function isThereContent() {
  return mmc.current.length > 0;
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
  if (event.ctrlKey && event.key === 'Escape') {
    const confirmed = confirm('Are you sure you want to remove all text from this page?\nTHIS WILL ALSO DELETE YOUR SYNCED DATA FROM GOOGLE DRIVE!');
    if (confirmed) {
      for (const element of el.editableElements) {
        element.innerHTML = '';
      }
      saveContent();
      location.reload();
    }
  } else if (event.key === 'Escape') {
    document.activeElement.blur();
  }
  const gridItem = event.target.closest('.grid-item');
  if (gridItem) {
    if (gridItem.classList.contains('lo')) {
      gridItem.classList.remove('lo');
    }
  }
}

function prep() {
  el.gridItems = document.querySelectorAll('.grid-item');
  el.editableElements = document.querySelectorAll('[contenteditable]');
  el.help = document.querySelector('#help');

  loadContent();

  document.addEventListener('keydown', keyboardHandler);

  for (const item of el.gridItems) {
    item.addEventListener('click', toggleItem);
  }

  for (const element of el.editableElements) {
    element.addEventListener('input', saveContent);
  }

  el.help.addEventListener('click', openUsageDialog);

  el.googleLogin = document.querySelector('#sign-in');
  el.googleLogout = document.querySelector('#sign-out');
  el.googleSyncLoad = document.querySelector('#sync-load');
  el.googleSyncSave = document.querySelector('#sync-save');
  el.googleLogin.style.visibility = 'hidden';
  el.googleLogout.style.visibility = 'hidden';
  el.googleSyncLoad.style.visibility = 'hidden';
  el.googleSyncSave.style.visibility = 'hidden';
  el.googleLogin.addEventListener('click', handleAuthClick);
  el.googleLogout.addEventListener('click', handleSignoutClick);
  el.googleSyncLoad.addEventListener('click', loadFromDrive);
  el.googleSyncSave.addEventListener('click', saveToDrive);
}

function openUsageDialog() {
  const dialog = document.querySelector('#usage');
  dialog.showModal();
  dialog.addEventListener('click', () => {
    dialog.close();
  });
}

/** GOOGLE DRIVE STUFFS **
* What can happen with the sync:
    * User has data in local storage, but not in google drive
        * User clicks sync
    * User has data in google drive, but not in local storage
        * google drive data is loaded into local storage
    * User has data in both local storage and google drive
        * User is prompted to choose which to keep
    * User has no data in either local storage or google drive
        * User starts a new localStorage session which is synced to google drive
    * User has data in both local storage and google drive, but they are the same
        * Nothing happens
**/
const CLIENT_ID = '18857136519-p50s7t4q7os98eijoo94g37mcdl9oj66.apps.googleusercontent.com';
const API_KEY = 'AIzaSyC6BHVwaIAMnP5itX3frfPJLgR10s2S-3w';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive'

let tokenClient;
let gapiInited = false;
let gisInited = false;

/**
* Callback after api.js is loaded.
*/
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

/**
 * Callback after the API client is loaded. Loads the
 * discovery doc to initialize the API.
 */
async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: [DISCOVERY_DOC],
  });
  gapiInited = true;
  maybeEnableButtons();
}

/**
 * Callback after Google Identity Services are loaded.
 */
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '', // defined later
  });
  gisInited = true;
}
maybeEnableButtons();

/**
 * Enables user interaction after all libraries are loaded.
 */
function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    el.googleLogin.style.visibility = 'visible';
  }
}

/**
 *  Sign in the user upon button click.
 */
function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      throw (resp);
    }
    el.googleSyncLoad.style.visibility = 'visible';
    el.googleSyncSave.style.visibility = 'visible';
    el.googleLogout.style.visibility = 'visible';
    el.googleLogin.style.visibility = 'hidden';
    await loadFromDrive();
  };

  if (gapi.client.getToken() === null) {
    // Prompt the user to select a Google Account and ask for consent to share their data
    // when establishing a new session.
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    // Skip display of account chooser and consent dialog for an existing session.
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

/**
 *  Sign out the user upon button click.
 */
function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    document.getElementById('content').innerText = '';
    el.googleSyncLoad.style.visibility = 'hidden';
    el.googleSyncSave.style.visibility = 'hidden';
    el.googleLogin.style.visibility = 'visible';
    el.googleLogout.style.visibility = 'hidden';
  }
}

/**
 * Discover files
 */
async function loadFromDrive() {
  // load .mmc file and prompt user to choose which to keep
  // check & load .mmc file exists in drive
  let response;
  try {
    response = await gapi.client.drive.files.list({
      'fields': 'files(id, name)',
    });
  } catch (err) {
    console.log(err.message);
    return;
  }
  const files = response.result.files;
  if (!files || files.length == 0) {
    console.log('No files found.');
    return;
  }

  const mmcFiles = files.filter(file => file.name === '.mmc');
  // there should only be one .mmc file
  // so we'll just ignore any others for now :)
  if (mmcFiles.length == 0) {
    newToDrive();
    return;
  }

  const mmcFile = mmcFiles[0];

  // load .mmc file
  try {
    response = await gapi.client.drive.files.get({
      'fileId': mmcFile.id,
      'alt': 'media',
    });
  } catch (err) {
    console.log(err.message);
    return;
  }
  const content = response.body;
  const confirmed = confirm('Would you like to load your synced data from Google Drive?\nTHIS WILL OVERWRITE YOUR LOCAL DATA!');
  if (confirmed) {
    console.log(content);
    localStorage.setItem('mmc', content);
    Object.assign(mmc, JSON.parse(content));
    loadContent();
  }
}

async function saveToDrive() {
  // save .mmc file and prompt user to choose which to keep
  let response;
  try {
    response = await gapi.client.drive.files.list({
      'fields': 'files(id, name)',
    });
  } catch (err) {
    console.log(err.message);
    return;
  }
  const files = response.result.files;
  if (!files || files.length == 0) {
    console.log('No files found.');
    return;
  }

  const mmcFiles = files.filter(file => file.name === '.mmc');
  // there should only be one .mmc file
  // so we'll just ignore any others for now :)
  if (mmcFiles.length == 0) {
    newToDrive();
    return;
  }

  const mmcFile = mmcFiles[0];
  const confirmed = confirm('Would you like to save your data to Google Drive?\nTHIS WILL OVERWRITE YOUR SYNCED DATA!');
  if (confirmed) {
    saveContent();
    // save .mmc file
    try {
      // we have to do this manually because the GAPI does not support BLOB upload
      response = await gapi.client.request({
        'path': `/upload/drive/v3/files/${mmcFile.id}`,
        'method': 'PATCH',
        'params': {
          'uploadType': 'media',
        },
        'body': localStorage.getItem('mmc'),
      });
    } catch (err) {
      console.log(err.message);
      return;
    }
  }
}

async function newToDrive() {
  // save new .mmc file to drive
  let response;
  try {
    response = await gapi.client.drive.files.create({
      'name': '.mmc',
      'mimeType': 'text/plain',
    });
  } catch (err) {
    console.log(err.message);
    return;
  }
  mmc.syncid = response.result.id;
}

async function deleteFromDrive() {
  // delete .mmc file from drive
  let response;
  try {
    response = await gapi.client.drive.files.delete({
      'fileId': mmc.syncid,
    });
  } catch (err) {
    console.log(err.message);
    return;
  }

}

window.addEventListener('load', prep);

