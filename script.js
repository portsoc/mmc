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
  if (inverseIds.length > 0 && inverseIds.length < 9  ) {
    fragment = inverseIds.join('-');
  }
  setFragment(fragment);
}

function setFragment(fragment) {
  const url = `${window.location.pathname}${window.location.search}#${fragment}`;
  window.history.replaceState(null, null, url);
}

function saveContent() {
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
    const confirmed = confirm('Are you sure you want to remove all text from this page?');
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


}

function openUsageDialog() {
  const dialog = document.querySelector('#usage');
  dialog.showModal();
  dialog.addEventListener('click', () => {
    dialog.close();
  });
}

window.addEventListener('load', prep);

