const gridItems = document.querySelectorAll('.grid-item');

function toggleItem(event) {
    if (event.metaKey || event.shiftKey) {
        const toggleThis = event.target.closest('.grid-item');
        toggleThis?.classList.toggle('lo');   
    }
}

for (const item of gridItems) {
  item.addEventListener('click', toggleItem);
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.activeElement.blur();
    }
  });