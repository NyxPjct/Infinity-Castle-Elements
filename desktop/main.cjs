const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { spawn } = require('child_process');

let mainWindow = null;
let gameServer = null;
let quitting = false;
let preferredResolution = 'native';
let multiplayerServerUrl = process.env.ICE_MULTIPLAYER_URL || '';
const MULTIPLAYER_DISCOVERY_URL = 'https://raw.githubusercontent.com/NyxPjct/Infinity-Castle-Elements/main/multiplayer-server.json';
const UPDATE_API_URL = 'https://api.github.com/repos/NyxPjct/Infinity-Castle-Elements/releases/latest';
let updateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseName: null,
  notes: '',
  releaseUrl: null,
  downloadUrl: null,
  assetName: null,
  progress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  installerPath: null,
  error: null,
  installMode: app.isPackaged ? (process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'installer') : 'development'
};

function publicUpdateState() {
  return {...updateState, installerPath: updateState.installerPath ? true : false};
}
function sendUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ice:update-state', publicUpdateState());
}
function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').split('-')[0];
}
function versionParts(value) {
  const parts = normalizeVersion(value).split('.').slice(0, 4).map(v => Number.parseInt(v, 10) || 0);
  while (parts.length < 4) parts.push(0);
  return parts;
}
function isVersionNewer(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}
async function checkForUpdates() {
  updateState = {...updateState, status:'checking', error:null, progress:0};
  sendUpdateState();
  try {
    const response = await fetch(UPDATE_API_URL, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Infinity-Castle-Elements-Updater'
      },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`GitHub respondeu HTTP ${response.status}`);
    const release = await response.json();
    const latestVersion = normalizeVersion(release.tag_name || release.name);
    const setupAsset = Array.isArray(release.assets) ? release.assets.find(a => /Infinity-Castle-Elements-Setup-.*\.exe$/i.test(a.name || '')) : null;
    const portableAsset = Array.isArray(release.assets) ? release.assets.find(a => /Infinity-Castle-Elements-Portable-.*\.exe$/i.test(a.name || '')) : null;
    const preferredAsset = updateState.installMode === 'portable' ? portableAsset : setupAsset;
    const available = Boolean(latestVersion && isVersionNewer(latestVersion, app.getVersion()));
    updateState = {
      ...updateState,
      status: available ? 'available' : 'up-to-date',
      currentVersion: app.getVersion(),
      latestVersion: latestVersion || app.getVersion(),
      releaseName: release.name || `Infinity Castle Elements ${latestVersion}`,
      notes: String(release.body || '').trim(),
      releaseUrl: release.html_url || null,
      downloadUrl: preferredAsset?.browser_download_url || null,
      assetName: preferredAsset?.name || null,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: Number(preferredAsset?.size) || 0,
      installerPath: null,
      error: available && !preferredAsset ? 'A atualização existe, mas o arquivo de Windows ainda não foi publicado.' : null
    };
    if (updateState.error) updateState.status = 'error';
  } catch (error) {
    updateState = {...updateState, status:'error', error:String(error?.message || error || 'Falha ao verificar atualizações.')};
  }
  sendUpdateState();
  return publicUpdateState();
}
async function downloadUpdate() {
  if (updateState.status !== 'available' || !updateState.downloadUrl) return publicUpdateState();
  if (updateState.installMode === 'portable') {
    await shell.openExternal(updateState.downloadUrl);
    updateState = {...updateState, status:'portable-opened'};
    sendUpdateState();
    return publicUpdateState();
  }
  if (updateState.installMode !== 'installer') {
    if (updateState.releaseUrl) await shell.openExternal(updateState.releaseUrl);
    return publicUpdateState();
  }
  const updatesDir = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(updatesDir, {recursive:true});
  const filename = updateState.assetName || `Infinity-Castle-Elements-Setup-${updateState.latestVersion}.exe`;
  const finalPath = path.join(updatesDir, filename);
  const tempPath = finalPath + '.part';
  try {
    fs.rmSync(tempPath, {force:true});
    updateState = {...updateState, status:'downloading', progress:0, downloadedBytes:0, installerPath:null, error:null};
    sendUpdateState();
    const response = await fetch(updateState.downloadUrl, {
      headers: {'User-Agent':'Infinity-Castle-Elements-Updater'},
      redirect: 'follow'
    });
    if (!response.ok || !response.body) throw new Error(`Falha no download: HTTP ${response.status}`);
    const total = Number(response.headers.get('content-length')) || updateState.totalBytes || 0;
    let downloaded = 0;
    let lastEmit = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        downloaded += chunk.length;
        const now = Date.now();
        if (now - lastEmit > 120 || (total && downloaded >= total)) {
          lastEmit = now;
          updateState.downloadedBytes = downloaded;
          updateState.totalBytes = total;
          updateState.progress = total ? Math.min(100, Math.round(downloaded / total * 100)) : 0;
          sendUpdateState();
        }
        callback(null, chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(tempPath));
    fs.renameSync(tempPath, finalPath);
    updateState = {...updateState, status:'downloaded', progress:100, downloadedBytes:downloaded, totalBytes:total, installerPath:finalPath};
  } catch (error) {
    try { fs.rmSync(tempPath, {force:true}); } catch {}
    updateState = {...updateState, status:'error', error:String(error?.message || error || 'Falha ao baixar atualização.')};
  }
  sendUpdateState();
  return publicUpdateState();
}
function installDownloadedUpdate() {
  if (updateState.installMode !== 'installer' || !updateState.installerPath || !fs.existsSync(updateState.installerPath)) return false;
  try {
    const escaped = updateState.installerPath.replace(/'/g, "''");
    const appExe = process.execPath.replace(/'/g, "''");
    const command = `Start-Sleep -Seconds 2; $installer = Start-Process -FilePath '${escaped}' -ArgumentList '/S' -PassThru -Wait; if (Test-Path '${appExe}') { Start-Process -FilePath '${appExe}' }`;
    const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', command], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    setTimeout(() => app.quit(), 150);
    return true;
  } catch (error) {
    updateState = {...updateState, status:'error', error:String(error?.message || error || 'Falha ao iniciar o instalador.')};
    sendUpdateState();
    return false;
  }
}

async function resolveMultiplayerServerUrl() {
  if (multiplayerServerUrl) return multiplayerServerUrl;
  try {
    const response = await fetch(`${MULTIPLAYER_DISCOVERY_URL}?v=${Date.now()}`);
    if (!response.ok) return '';
    const data = await response.json();
    const url = String(data?.url || '').trim().replace(/\/$/, '');
    if (/^https:\/\//i.test(url)) multiplayerServerUrl = url;
  } catch {}
  return multiplayerServerUrl;
}

function saveStorePath() {
  return path.join(app.getPath('userData'), 'save-data.json');
}
function readSaveStore() {
  try {
    const file = saveStorePath();
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function writeSaveStore(store) {
  const file = saveStorePath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}


app.setName('Infinity Castle Elements');
app.setAppUserModelId('com.nyxprojectr.infinitycastleelements');

async function startEmbeddedServer() {
  const serverModule = require(path.join(__dirname, '..', 'server.js'));
  gameServer = serverModule.server;
  if (gameServer.listening) return gameServer.address().port;

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      gameServer.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      gameServer.off('error', onError);
      resolve();
    };
    gameServer.once('error', onError);
    gameServer.once('listening', onListening);
    gameServer.listen(0, '127.0.0.1');
  });
  return gameServer.address().port;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    fullscreen: true,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Infinity Castle Elements — INSANITY 0.0.2',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.setFullScreen(true);
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const u = new URL(url);
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      const next = !mainWindow.isFullScreen();
      mainWindow.setFullScreen(next);
      if (!next) setTimeout(applyPreferredWindowSize, 80);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function applyPreferredWindowSize() {
  if (!mainWindow || mainWindow.isFullScreen()) return;
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const maxW = Math.max(1100, display.workAreaSize.width);
  const maxH = Math.max(680, display.workAreaSize.height);
  let width = Math.min(1600, maxW), height = Math.min(900, maxH);
  if (preferredResolution !== 'native') {
    const match = /^(\d{3,4})x(\d{3,4})$/.exec(preferredResolution);
    if (match) {
      width = Math.max(1100, Math.min(Number(match[1]), maxW));
      height = Math.max(680, Math.min(Number(match[2]), maxH));
    }
  }
  mainWindow.setSize(width, height);
  mainWindow.center();
}

ipcMain.on('ice:storage-get', (event, key) => {
  const store = readSaveStore();
  event.returnValue = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
});
ipcMain.on('ice:storage-set', (event, key, value) => {
  const store = readSaveStore();
  store[key] = String(value ?? '');
  writeSaveStore(store);
  event.returnValue = true;
});
ipcMain.on('ice:storage-remove', (event, key) => {
  const store = readSaveStore();
  delete store[key];
  writeSaveStore(store);
  event.returnValue = true;
});

ipcMain.on('ice:get-multiplayer-url', (event) => { event.returnValue = multiplayerServerUrl; });
ipcMain.on('ice:get-app-version', (event) => { event.returnValue = app.getVersion(); });
ipcMain.on('ice:get-install-mode', (event) => { event.returnValue = updateState.installMode; });
ipcMain.handle('ice:get-update-state', () => publicUpdateState());
ipcMain.handle('ice:check-for-updates', () => checkForUpdates());
ipcMain.handle('ice:download-update', () => downloadUpdate());
ipcMain.handle('ice:install-update', () => installDownloadedUpdate());
ipcMain.on('ice:quit', () => app.quit());
ipcMain.handle('ice:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  if (!next) setTimeout(applyPreferredWindowSize, 80);
  return next;
});
ipcMain.handle('ice:is-fullscreen', () => Boolean(mainWindow?.isFullScreen()));
ipcMain.handle('ice:set-fullscreen', (_event, enabled) => {
  if (!mainWindow) return false;
  const next = Boolean(enabled);
  mainWindow.setFullScreen(next);
  if (!next) setTimeout(applyPreferredWindowSize, 80);
  return next;
});
ipcMain.handle('ice:set-resolution', (_event, value) => {
  preferredResolution = typeof value === 'string' ? value : 'native';
  applyPreferredWindowSize();
  return preferredResolution;
});

app.whenReady().then(async () => {
  try {
    await resolveMultiplayerServerUrl();
    const port = await startEmbeddedServer();
    createWindow(port);
    setTimeout(() => { checkForUpdates().catch(() => {}); }, 3500);
  } catch (error) {
    console.error('Falha ao iniciar Infinity Castle Elements:', error);
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const port = gameServer?.listening ? gameServer.address().port : await startEmbeddedServer();
    createWindow(port);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (quitting) return;
  quitting = true;
  try {
    if (gameServer?.listening) gameServer.close();
  } catch {}
});
