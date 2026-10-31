const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_UNPINNED = 200;
const MAX_TEXT_LENGTH = 100_000;

class HistoryStore {
  constructor(dir) {
    this.file = path.join(dir, 'history.json');
    this.items = [];
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(data.items)) this.items = data.items;
    } catch {
      this.items = [];
    }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.saveTimer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ items: this.items }));
    fs.renameSync(tmp, this.file);
  }

  list() {
    return this.items;
  }

  // 新しいテキストを先頭に追加（重複は先頭へ移動）
  add(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) return false;
    const existing = this.items.find((i) => i.text === text);
    if (existing) {
      if (this.items[0] === existing) return false;
      this.items = [existing, ...this.items.filter((i) => i !== existing)];
      existing.createdAt = Date.now();
    } else {
      this.items.unshift({
        id: crypto.randomUUID(),
        text,
        pinned: false,
        createdAt: Date.now(),
      });
      this.trim();
    }
    this.save();
    return true;
  }

  trim() {
    let unpinned = 0;
    this.items = this.items.filter((i) => i.pinned || ++unpinned <= MAX_UNPINNED);
  }

  get(id) {
    return this.items.find((i) => i.id === id);
  }

  togglePin(id) {
    const item = this.get(id);
    if (!item) return;
    item.pinned = !item.pinned;
    this.save();
  }

  remove(id) {
    this.items = this.items.filter((i) => i.id !== id);
    this.save();
  }

  clearUnpinned() {
    this.items = this.items.filter((i) => i.pinned);
    this.save();
  }
}

module.exports = { HistoryStore };
