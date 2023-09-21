const el = {};

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

}

function saveContent() {
  const mmc = {};
  for (const element of el.editableElements) {
    const parentWithId = element.closest('[id]');
    if (parentWithId) {
      mmc[parentWithId.id] = element.innerHTML;
    }
  }
  localStorage.setItem('mmc', JSON.stringify(mmc));
}

function loadContent() {
  const mmc = JSON.parse( localStorage.getItem('mmc') ?? "[]" );
  for (const element of el.editableElements) {
    const parentWithId = element.closest('[id]');
    if (parentWithId && mmc.hasOwnProperty(parentWithId.id)) {
      element.innerHTML = mmc[parentWithId.id];
    }
  }
}

function keyboardHandler(event) {
  if (event.ctrlKey && event.key === 'Escape') {
    const confirmed = confirm('Are you sure you want to reset the page?');
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
}

function prep() {
  el.gridItems = document.querySelectorAll('.grid-item');
  el.editableElements = document.querySelectorAll('[contenteditable]');

  loadContent();

  for (const item of el.gridItems) {
    item.addEventListener('click', toggleItem);
  }

  for (const element of el.editableElements) {
    element.addEventListener('input', saveContent);
  }
  
  document.addEventListener('keydown', keyboardHandler);
  
}

window.addEventListener('load', prep);

