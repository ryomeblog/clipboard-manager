const api = window.clipboardApi;
const searchEl = document.getElementById('search');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');

let items = [];
let visible = [];
let selectedIndex = 0;

// 改行は残し、前後の空行だけ取り除く
function preview(text) {
  return text.replace(/^\s*\n|\n\s*$/g, '').replace(/\t/g, '    ');
}

// ピン留めを上に、それ以外は新しい順
function filterItems() {
  const q = searchEl.value.trim().toLowerCase();
  const matched = q ? items.filter((i) => i.text.toLowerCase().includes(q)) : items;
  return [...matched.filter((i) => i.pinned), ...matched.filter((i) => !i.pinned)];
}

function render() {
  visible = filterItems();
  selectedIndex = Math.min(selectedIndex, Math.max(visible.length - 1, 0));
  listEl.replaceChildren();
  emptyEl.hidden = visible.length > 0;

  visible.forEach((item, idx) => {
    if (idx > 0 && visible[idx - 1].pinned && !item.pinned) {
      const divider = document.createElement('li');
      divider.className = 'divider';
      listEl.append(divider);
    }

    const li = document.createElement('li');
    li.className = 'item';
    li.classList.toggle('pinned', item.pinned);
    li.classList.toggle('selected', idx === selectedIndex);
    li.title = item.text.length > 500 ? `${item.text.slice(0, 500)}…` : item.text;

    const index = document.createElement('span');
    index.className = 'index';
    index.textContent = idx < 9 ? String(idx + 1) : '';

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = preview(item.text);

    const pin = document.createElement('button');
    pin.className = 'pin';
    pin.textContent = item.pinned ? '★' : '☆';
    pin.title = item.pinned ? 'ピン留めを解除' : 'ピン留め';
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      api.togglePin(item.id);
    });

    li.append(index, text, pin);
    li.addEventListener('mousemove', () => {
      if (selectedIndex !== idx) {
        selectedIndex = idx;
        updateSelection();
      }
    });
    li.addEventListener('click', () => api.select(item.id));
    listEl.append(li);
  });
}

function updateSelection() {
  listEl.querySelectorAll('li.item').forEach((li, idx) => {
    li.classList.toggle('selected', idx === selectedIndex);
  });
  listEl.querySelectorAll('li.item')[selectedIndex]?.scrollIntoView({ block: 'nearest' });
}

function moveSelection(delta) {
  if (!visible.length) return;
  selectedIndex = (selectedIndex + delta + visible.length) % visible.length;
  updateSelection();
}

searchEl.addEventListener('input', () => {
  selectedIndex = 0;
  render();
});

document.addEventListener('keydown', (e) => {
  const current = visible[selectedIndex];
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
    e.preventDefault();
    moveSelection(1);
  } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
    e.preventDefault();
    moveSelection(-1);
  } else if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    if (current) api.select(current.id);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (searchEl.value) {
      searchEl.value = '';
      selectedIndex = 0;
      render();
    } else {
      api.hide();
    }
  } else if (e.metaKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    if (current) api.togglePin(current.id);
  } else if (e.metaKey && e.key === 'Backspace') {
    e.preventDefault();
    if (current) api.remove(current.id);
  } else if (e.metaKey && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    const target = visible[Number(e.key) - 1];
    if (target) api.select(target.id);
  }
});

api.onHistoryUpdate((next) => {
  items = next;
  render();
});

api.onShown(() => {
  searchEl.value = '';
  selectedIndex = 0;
  render();
  searchEl.focus();
});

api.getHistory().then((next) => {
  items = next;
  render();
});
