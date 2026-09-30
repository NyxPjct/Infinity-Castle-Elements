const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  desktop: true,
  version: '0.0.0',
  multiplayerUrl: ipcRenderer.sendSync('ice:get-multiplayer-url'),
  quit: () => ipcRenderer.send('ice:quit'),
  toggleFullscreen: () => ipcRenderer.invoke('ice:toggle-fullscreen'),
  setFullscreen: (enabled) => ipcRenderer.invoke('ice:set-fullscreen', enabled),
  isFullscreen: () => ipcRenderer.invoke('ice:is-fullscreen'),
  setResolution: (value) => ipcRenderer.invoke('ice:set-resolution', value),
  storageGet: (key) => ipcRenderer.sendSync('ice:storage-get', key),
  storageSet: (key, value) => ipcRenderer.sendSync('ice:storage-set', key, value),
  storageRemove: (key) => ipcRenderer.sendSync('ice:storage-remove', key)
});
