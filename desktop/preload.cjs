const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  desktop: true,
  version: ipcRenderer.sendSync('ice:get-app-version'),
  installMode: ipcRenderer.sendSync('ice:get-install-mode'),
  multiplayerUrl: ipcRenderer.sendSync('ice:get-multiplayer-url'),
  quit: () => ipcRenderer.send('ice:quit'),
  toggleFullscreen: () => ipcRenderer.invoke('ice:toggle-fullscreen'),
  setFullscreen: (enabled) => ipcRenderer.invoke('ice:set-fullscreen', enabled),
  isFullscreen: () => ipcRenderer.invoke('ice:is-fullscreen'),
  setResolution: (value) => ipcRenderer.invoke('ice:set-resolution', value),
  storageGet: (key) => ipcRenderer.sendSync('ice:storage-get', key),
  storageSet: (key, value) => ipcRenderer.sendSync('ice:storage-set', key, value),
  storageRemove: (key) => ipcRenderer.sendSync('ice:storage-remove', key),
  getUpdateState: () => ipcRenderer.invoke('ice:get-update-state'),
  checkForUpdates: () => ipcRenderer.invoke('ice:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('ice:download-update'),
  installUpdate: () => ipcRenderer.invoke('ice:install-update'),
  onUpdateState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('ice:update-state', handler);
    return () => ipcRenderer.removeListener('ice:update-state', handler);
  }
});
