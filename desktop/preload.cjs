const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  desktop: true,
  version: '0.0.0',
  quit: () => ipcRenderer.send('ice:quit'),
  toggleFullscreen: () => ipcRenderer.invoke('ice:toggle-fullscreen'),
  setFullscreen: (enabled) => ipcRenderer.invoke('ice:set-fullscreen', enabled),
  isFullscreen: () => ipcRenderer.invoke('ice:is-fullscreen'),
  setResolution: (value) => ipcRenderer.invoke('ice:set-resolution', value)
});
