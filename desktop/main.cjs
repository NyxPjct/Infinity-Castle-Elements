const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

let mainWindow = null;
let gameServer = null;
let quitting = false;

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
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Infinity Castle Elements — INSANITY 0.0',
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
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      event.preventDefault();
      mainWindow.setFullScreen(false);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.on('ice:quit', () => app.quit());
ipcMain.handle('ice:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  return mainWindow.isFullScreen();
});
ipcMain.handle('ice:is-fullscreen', () => Boolean(mainWindow?.isFullScreen()));

app.whenReady().then(async () => {
  try {
    const port = await startEmbeddedServer();
    createWindow(port);
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
