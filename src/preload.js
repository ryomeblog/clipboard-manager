const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboardApi', {
  getHistory: () => ipcRenderer.invoke('history:get'),
  select: (id) => ipcRenderer.send('item:select', id),
  togglePin: (id) => ipcRenderer.send('item:togglePin', id),
  remove: (id) => ipcRenderer.send('item:remove', id),
  hide: () => ipcRenderer.send('popup:hide'),
  onHistoryUpdate: (cb) => ipcRenderer.on('history:update', (_e, items) => cb(items)),
  onShown: (cb) => ipcRenderer.on('popup:shown', () => cb()),
});
