const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  desktop: true,
  version: '0.0.0',
  quit: () => ipcRenderer.send('ice:quit'),
  toggleFullscreen: () => ipcRenderer.invoke('ice:toggle-fullscreen'),
  setFullscreen: (enabled) => ipcRenderer.invoke('ice:set-fullscreen', enabled),
  isFullscreen: () => ipcRenderer.invoke('ice:is-fullscreen'),
  setResolution: (value) => ipcRenderer.invoke('ice:set-resolution', value),
  storageGet: (key) => ipcRenderer.sendSync('ice:storage-get', key),
  storageSet: (key, value) => ipcRenderer.send('ice:storage-set', key, value),
  storageRemove: (key) => ipcRenderer.send('ice:storage-remove', key)
});
