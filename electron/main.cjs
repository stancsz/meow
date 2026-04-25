/**
 * main.cjs
 * 
 * Meowju Coworker Desktop (Electron Shell)
 * Inspired by Different AI OpenWork / Claude Cowork.
 * 
 * This is the primary desktop application process.
 */

const { app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let tray;
let bridgeServer;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false, // Premium borderless look
    titleBarStyle: 'hidden', // Essential for macOS, provides cleaner look on Windows
    backgroundColor: '#09090b',
    show: false, // Show only when ready
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const isDev = process.env.NODE_ENV === 'development' || true;
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dashboard/out/index.html'));
  }

  // Visual polish: Fade in when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBridgeServer() {
  console.log('🚀 Starting Meowju Coworker Bridge Server...');
  // Force clean slate for development
  bridgeServer = spawn('bun', ['run', 'agent-harness/src/server.ts'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: 3001 }
  });

  bridgeServer.on('error', (err) => {
    console.error('Failed to start bridge server:', err);
  });
}

function createTray() {
  const icon = nativeImage.createEmpty(); 
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Dashboard', click: () => { mainWindow.show(); } },
    { label: 'Clear Active Mission', click: () => { /* IPC to bridge */ } },
    { type: 'separator' },
    { label: 'Quit Meowju', click: () => { app.quit(); } }
  ]);
  tray.setToolTip('Meowju Coworker');
  tray.setContextMenu(contextMenu);
}

// ============================================================================
// Desktop Integration (The "Coworker" Experience)
// ============================================================================

function registerShortcuts() {
  // Alt+Space to toggle dashboard (Standard for spotlight-style apps)
  const ret = globalShortcut.register('Alt+Space', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  if (!ret) console.warn('Global shortcut registration failed');
}

// Handling IPC from the Dashboard
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.on('window-minimize', () => mainWindow?.minimize());

// ============================================================================
// Lifecycle
// ============================================================================

app.whenReady().then(() => {
  startBridgeServer();
  createWindow();
  createTray();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (bridgeServer) bridgeServer.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
