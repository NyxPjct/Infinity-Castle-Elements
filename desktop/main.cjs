const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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
const UPDATE_HISTORY_API_URL = 'https://api.github.com/repos/NyxPjct/Infinity-Castle-Elements/releases?per_page=8';
let installTriggered = false;
let updateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseName: null,
  notes: '',
  releaseUrl: null,
  downloadUrl: null,
  assetName: null,
  digest: null,
  verified: false,
  required: false,
  history: [],
  progress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  partialBytes: 0,
  canResume: false,
  installerPath: null,
  installOnExit: false,
  backupCreated: false,
  error: null,
  installMode: app.isPackaged ? (process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'installer') : 'development'
};

function publicUpdateState() {
  return {
    ...updateState,
    installerPath: Boolean(updateState.installerPath),
    backupCreated: Boolean(updateState.backupCreated)
  };
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
function releaseRequiresUpdate(release) {
  const body = String(release?.body || '');
  return /<!--\s*required-update\s*-->/i.test(body) || /\[ATUALIZA[CÇ][AÃ]O OBRIGAT[OÓ]RIA\]/i.test(body);
}
function releaseHistoryEntry(release) {
  return {
    version: normalizeVersion(release?.tag_name || release?.name),
    name: String(release?.name || release?.tag_name || '').trim(),
    notes: String(release?.body || '').trim(),
    publishedAt: release?.published_at || null,
    url: release?.html_url || null,
    prerelease: Boolean(release?.prerelease)
  };
}
function digestValue(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^sha256:([a-f0-9]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
  });
}
function updateBackupRoot() {
  return path.join(app.getPath('userData'), 'backups');
}
function copyPathIfExists(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive:true });
  fs.cpSync(source, destination, { recursive:true, force:true });
}
function pruneUpdateBackups() {
  try {
    const root = updateBackupRoot();
    if (!fs.existsSync(root)) return;
    const dirs = fs.readdirSync(root, { withFileTypes:true })
      .filter(x => x.isDirectory() && x.name.startsWith('update-'))
      .map(x => ({name:x.name, path:path.join(root,x.name), mtime:fs.statSync(path.join(root,x.name)).mtimeMs}))
      .sort((a,b)=>b.mtime-a.mtime);
    for (const old of dirs.slice(5)) fs.rmSync(old.path, {recursive:true,force:true});
  } catch {}
}
function createUpdateBackup() {
  const current = normalizeVersion(app.getVersion());
  const target = normalizeVersion(updateState.latestVersion || 'next');
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  const dir = path.join(updateBackupRoot(), `update-${current}-to-${target}-${stamp}`);
  fs.mkdirSync(dir, {recursive:true});
  copyPathIfExists(saveStorePath(), path.join(dir,'save-data.json'));
  copyPathIfExists(path.join(app.getPath('userData'),'Local Storage'), path.join(dir,'Local Storage'));
  copyPathIfExists(path.join(app.getPath('userData'),'IndexedDB'), path.join(dir,'IndexedDB'));
  fs.writeFileSync(path.join(dir,'backup-info.json'), JSON.stringify({
    createdAt:new Date().toISOString(), currentVersion:current, targetVersion:target,
    installMode:updateState.installMode
  }, null, 2), 'utf8');
  pruneUpdateBackups();
  return dir;
}
function parseContentRangeTotal(value) {
  const m = String(value || '').match(/\/(\d+)$/);
  return m ? Number(m[1]) || 0 : 0;
}

async function checkForUpdates() {
  updateState = {...updateState, status:'checking', error:null};
  sendUpdateState();
  try {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Infinity-Castle-Elements-Updater'
    };
    const [latestResponse, historyResponse] = await Promise.all([
      fetch(UPDATE_API_URL, {headers, cache:'no-store'}),
      fetch(UPDATE_HISTORY_API_URL, {headers, cache:'no-store'}).catch(()=>null)
    ]);
    if (!latestResponse.ok) throw new Error(`GitHub respondeu HTTP ${latestResponse.status}`);
    const release = await latestResponse.json();
    let history = updateState.history || [];
    if (historyResponse?.ok) {
      const releases = await historyResponse.json();
      if (Array.isArray(releases)) history = releases.filter(r=>!r.draft).map(releaseHistoryEntry);
    }
    const latestVersion = normalizeVersion(release.tag_name || release.name);
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const setupAsset = assets.find(a => /Infinity-Castle-Elements-Setup-.*\.exe$/i.test(a.name || ''));
    const portableAsset = assets.find(a => /Infinity-Castle-Elements-Portable-.*\.exe$/i.test(a.name || ''));
    const apkAsset = assets.find(a => /Infinity-Castle-Elements-Android-.*\.apk$/i.test(a.name || ''));
    const preferredAsset = updateState.installMode === 'portable' ? portableAsset :
      updateState.installMode === 'installer' ? setupAsset : setupAsset || portableAsset || apkAsset;
    const available = Boolean(latestVersion && isVersionNewer(latestVersion, app.getVersion()));
    const keepDownloaded = updateState.status === 'downloaded' && updateState.latestVersion === latestVersion && updateState.installerPath;
    updateState = {
      ...updateState,
      status: keepDownloaded ? 'downloaded' : (available ? 'available' : 'up-to-date'),
      currentVersion: app.getVersion(),
      latestVersion: latestVersion || app.getVersion(),
      releaseName: release.name || `Infinity Castle Elements ${latestVersion}`,
      notes: String(release.body || '').trim(),
      releaseUrl: release.html_url || null,
      downloadUrl: preferredAsset?.browser_download_url || null,
      assetName: preferredAsset?.name || null,
      digest: preferredAsset?.digest || null,
      required: releaseRequiresUpdate(release),
      history,
      progress: keepDownloaded ? 100 : 0,
      downloadedBytes: keepDownloaded ? updateState.downloadedBytes : 0,
      totalBytes: Number(preferredAsset?.size) || updateState.totalBytes || 0,
      partialBytes: 0,
      canResume: false,
      verified: keepDownloaded ? updateState.verified : false,
      installerPath: keepDownloaded ? updateState.installerPath : null,
      error: available && !preferredAsset ? 'A atualização existe, mas o arquivo compatível ainda não foi publicado.' : null
    };
    if (updateState.error) updateState.status = 'error';
  } catch (error) {
    updateState = {...updateState, status:'error', error:String(error?.message || error || 'Falha ao verificar atualizações.')};
  }
  sendUpdateState();
  return publicUpdateState();
}
async function downloadUpdate() {
  if (!updateState.downloadUrl) return publicUpdateState();
  if (updateState.installMode === 'development') {
    if (updateState.releaseUrl) await shell.openExternal(updateState.releaseUrl);
    return publicUpdateState();
  }
  if (!['available','error','paused'].includes(updateState.status)) {
    if (updateState.status === 'downloaded') return publicUpdateState();
    return publicUpdateState();
  }
  const updatesDir = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(updatesDir, {recursive:true});
  const fallbackName = updateState.installMode === 'portable'
    ? `Infinity-Castle-Elements-Portable-${updateState.latestVersion}.exe`
    : `Infinity-Castle-Elements-Setup-${updateState.latestVersion}.exe`;
  const filename = updateState.assetName || fallbackName;
  const finalPath = path.join(updatesDir, filename);
  const tempPath = finalPath + '.part';
  try {
    if (fs.existsSync(finalPath)) {
      const expected = digestValue(updateState.digest);
      const actual = expected ? await sha256File(finalPath) : null;
      if (!expected || actual === expected) {
        const size = fs.statSync(finalPath).size;
        updateState = {...updateState,status:'downloaded',progress:100,downloadedBytes:size,totalBytes:updateState.totalBytes||size,installerPath:finalPath,verified:Boolean(expected),partialBytes:0,canResume:false,error:null};
        sendUpdateState(); return publicUpdateState();
      }
      fs.rmSync(finalPath,{force:true});
    }

    let existing = fs.existsSync(tempPath) ? fs.statSync(tempPath).size : 0;
    const headers = {'User-Agent':'Infinity-Castle-Elements-Updater'};
    if (existing > 0) headers.Range = `bytes=${existing}-`;
    updateState = {...updateState,status:'downloading',progress:updateState.totalBytes?Math.min(99,Math.round(existing/updateState.totalBytes*100)):0,downloadedBytes:existing,partialBytes:existing,canResume:existing>0,installerPath:null,error:null};
    sendUpdateState();

    let response = await fetch(updateState.downloadUrl, {headers,redirect:'follow'});
    let append = existing > 0 && response.status === 206;
    if (existing > 0 && !append) {
      existing = 0;fs.rmSync(tempPath,{force:true});
      response = await fetch(updateState.downloadUrl, {headers:{'User-Agent':'Infinity-Castle-Elements-Updater'},redirect:'follow'});
    }
    if (!response.ok || !response.body) throw new Error(`Falha no download: HTTP ${response.status}`);
    const rangeTotal = parseContentRangeTotal(response.headers.get('content-range'));
    const bodyLength = Number(response.headers.get('content-length')) || 0;
    const total = rangeTotal || (bodyLength ? bodyLength + (append ? existing : 0) : updateState.totalBytes || 0);
    let downloaded = append ? existing : 0;
    let lastEmit = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        downloaded += chunk.length;
        const now = Date.now();
        if (now - lastEmit > 120 || (total && downloaded >= total)) {
          lastEmit = now;
          updateState.downloadedBytes = downloaded;
          updateState.partialBytes = downloaded;
          updateState.totalBytes = total;
          updateState.progress = total ? Math.min(100, Math.round(downloaded / total * 100)) : 0;
          updateState.canResume = downloaded > 0;
          sendUpdateState();
        }
        callback(null, chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(tempPath,{flags:append?'a':'w'}));
    fs.renameSync(tempPath, finalPath);

    const expected = digestValue(updateState.digest);
    let verified = false;
    if (expected) {
      updateState = {...updateState,status:'verifying',progress:100,downloadedBytes:downloaded,totalBytes:total,error:null};
      sendUpdateState();
      const actual = await sha256File(finalPath);
      if (actual !== expected) {
        fs.rmSync(finalPath,{force:true});
        throw new Error('Falha de integridade SHA-256. O arquivo baixado não corresponde à release oficial.');
      }
      verified = true;
    }
    updateState = {...updateState,status:'downloaded',progress:100,downloadedBytes:downloaded,totalBytes:total,partialBytes:0,canResume:false,installerPath:finalPath,verified,error:null};
  } catch (error) {
    const partialBytes = fs.existsSync(tempPath) ? fs.statSync(tempPath).size : 0;
    updateState = {...updateState,status:'error',partialBytes,downloadedBytes:partialBytes,canResume:partialBytes>0,error:String(error?.message || error || 'Falha ao baixar atualização.')};
  }
  sendUpdateState();
  return publicUpdateState();
}
function psQuote(value) {
  return "'" + String(value ?? '').replace(/'/g, "''") + "'";
}
function installDownloadedUpdate() {
  if (installTriggered || !updateState.installerPath || !fs.existsSync(updateState.installerPath)) return false;
  if (!['installer','portable'].includes(updateState.installMode)) return false;
  try {
    const downloadedPath = updateState.installerPath;
    const targetVersion = normalizeVersion(updateState.latestVersion || '');
    const logPath = path.join(app.getPath('userData'), 'update-install.log');
    const parentPid = process.pid;
    const backupDir = createUpdateBackup();
    updateState = {...updateState,status:'installing',backupCreated:true,error:null};
    sendUpdateState();
    installTriggered = true;

    let command;
    if (updateState.installMode === 'portable') {
      const targetExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
      const previousExe = targetExe + '.previous.exe';
      command = [
        "$ErrorActionPreference = 'Stop'",
        `$downloaded = ${psQuote(downloadedPath)}`,
        `$targetExe = ${psQuote(targetExe)}`,
        `$previousExe = ${psQuote(previousExe)}`,
        `$targetVersion = ${psQuote(targetVersion)}`,
        `$log = ${psQuote(logPath)}`,
        `$parentPid = ${parentPid}`,
        `"[$(Get-Date -Format o)] portable updater start: $targetVersion" | Out-File -FilePath $log -Encoding utf8 -Append`,
        "while (Get-Process -Id $parentPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 250 }",
        "Start-Sleep -Milliseconds 500",
        "try { if (Test-Path $previousExe) { Remove-Item $previousExe -Force }; if (Test-Path $targetExe) { Copy-Item $targetExe $previousExe -Force }; Copy-Item $downloaded $targetExe -Force } catch { if (Test-Path $previousExe) { Copy-Item $previousExe $targetExe -Force }; throw }",
        `"[$(Get-Date -Format o)] portable replaced" | Out-File -FilePath $log -Encoding utf8 -Append`,
        "Start-Process -FilePath $targetExe -ArgumentList '--updated'"
      ].join('; ');
    } else {
      const currentExe = process.execPath;
      const installDir = path.dirname(currentExe);
      command = [
        "$ErrorActionPreference = 'Stop'",
        `$installer = ${psQuote(downloadedPath)}`,
        `$targetExe = ${psQuote(currentExe)}`,
        `$installDir = ${psQuote(installDir)}`,
        `$targetVersion = ${psQuote(targetVersion)}`,
        `$log = ${psQuote(logPath)}`,
        `$parentPid = ${parentPid}`,
        `"[$(Get-Date -Format o)] updater start: $targetVersion" | Out-File -FilePath $log -Encoding utf8 -Append`,
        "while (Get-Process -Id $parentPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 250 }",
        "Start-Sleep -Milliseconds 500",
        `$argLine = '/S --updated "/D=' + $installDir + '"'`,
        `"[$(Get-Date -Format o)] installer: $installer $argLine" | Out-File -FilePath $log -Encoding utf8 -Append`,
        "$proc = Start-Process -FilePath $installer -ArgumentList $argLine -PassThru -Wait",
        `"[$(Get-Date -Format o)] installer exit: $($proc.ExitCode)" | Out-File -FilePath $log -Encoding utf8 -Append`,
        "if ($proc.ExitCode -ne 0) { exit $proc.ExitCode }",
        "$ready = $false",
        `for ($i = 0; $i -lt 40; $i++) { if (Test-Path $targetExe) { try { $v = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($targetExe).ProductVersion; if ($v) { "[$(Get-Date -Format o)] installed version: $v" | Out-File -FilePath $log -Encoding utf8 -Append; if (-not $targetVersion -or $v.StartsWith($targetVersion)) { $ready = $true; break } } } catch {} }; Start-Sleep -Milliseconds 250 }`,
        `if (-not $ready) { "[$(Get-Date -Format o)] target executable/version not ready; backup at ${backupDir.replace(/'/g,"''")}" | Out-File -FilePath $log -Encoding utf8 -Append; exit 3 }`,
        "Start-Process -FilePath $targetExe -ArgumentList '--updated'"
      ].join('; ');
    }

    const child = spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-Command',command], {detached:true,stdio:'ignore',windowsHide:true});
    child.unref();
    try { mainWindow?.hide(); } catch {}
    try { if (gameServer?.listening) gameServer.close(); } catch {}
    quitting = true;
    setTimeout(() => app.exit(0), 300);
    return true;
  } catch (error) {
    installTriggered = false;
    updateState = {...updateState,status:'error',error:String(error?.message || error || 'Falha ao iniciar o instalador.')};
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
    title: `Infinity Castle Elements — INSANITY ${app.getVersion()}`,
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
ipcMain.handle('ice:set-install-on-exit', (_event, enabled) => {
  updateState = {...updateState, installOnExit:Boolean(enabled)&&updateState.status==='downloaded'};
  sendUpdateState();
  return publicUpdateState();
});
ipcMain.on('ice:quit', () => {
  if (updateState.installOnExit && updateState.status === 'downloaded' && !installTriggered) installDownloadedUpdate();
  else app.quit();
});
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

app.on('before-quit', event => {
  if (!installTriggered && updateState.installOnExit && updateState.status === 'downloaded' && updateState.installerPath) {
    event.preventDefault();
    installDownloadedUpdate();
    return;
  }
  if (quitting) return;
  quitting = true;
  try {
    if (gameServer?.listening) gameServer.close();
  } catch {}
});
