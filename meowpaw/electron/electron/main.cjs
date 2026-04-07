const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let serverProcess = null;
let agentProcess = null;
let agentStdin = null;
let agentStdout = null;
let agentStderr = null;

// Workspace path (for file sandboxing)
let workspacePath = null;

// ACP request tracking
let requestId = 0;
const pendingRequests = new Map();
let streamBuffer = '';
let streamResolve = null;

const isDev = process.env.NODE_ENV !== 'production';
const isProd = !isDev;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#f1f5f9',
      height: 36
    },
    trafficLightPosition: { x: 16, y: 16 },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    show: false,
    backgroundColor: '#0f172a'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(isDev ? 'http://localhost:3000' : 'http://localhost:3001');
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '../../server/server');
    if (!fs.existsSync(path.join(serverPath, 'package.json'))) {
      reject(new Error('Server directory not found'));
      return;
    }

    if (isDev) {
      console.log('Development mode: Assuming Next.js dev server is running on localhost:3000');
      resolve(null);
      return;
    }

    // In production, ensure the server is built
    const nextBuildDir = path.join(serverPath, '.next');
    if (!fs.existsSync(nextBuildDir)) {
      console.warn('Next.js build directory not found. Attempting to build...');
      try {
        const buildProcess = spawn('npm', ['run', 'build'], {
          cwd: serverPath,
          stdio: 'pipe',
          shell: true
        });

        buildProcess.stdout.on('data', (data) => {
          console.log(`Build: ${data}`);
        });

        buildProcess.stderr.on('data', (data) => {
          console.error(`Build error: ${data}`);
        });

        buildProcess.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Build failed with code ${code}`));
            return;
          }
          console.log('Server built successfully');
          startProductionServer(serverPath, resolve, reject);
        });
      } catch (error) {
        reject(new Error(`Failed to build server: ${error.message}`));
      }
    } else {
      startProductionServer(serverPath, resolve, reject);
    }
  });
}

function startProductionServer(serverPath, resolve, reject) {
  serverProcess = spawn('npm', ['start'], {
    cwd: serverPath,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: '3001' }
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
    if (data.toString().includes('ready') || data.toString().includes('localhost')) {
      resolve(serverProcess);
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
    reject(err);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    serverProcess = null;
  });
}

function startAgent() {
  return new Promise((resolve, reject) => {
    const agentPath = path.join(__dirname, '../../..');
    if (!fs.existsSync(path.join(agentPath, 'package.json'))) {
      reject(new Error('Agent directory not found'));
      return;
    }

    // Spawn ACP mode
    agentProcess = spawn('bun', ['run', 'start', '--acp'], {
      cwd: agentPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    agentStdin = agentProcess.stdin;
    agentStdout = agentProcess.stdout;
    agentStderr = agentProcess.stderr;

    // Handle stdout - parse NDJ JSON-RPC responses
    agentStdout.on('data', (data) => {
      const chunk = data.toString();
      streamBuffer += chunk;

      // Split by newlines
      const lines = streamBuffer.split('\n');
      streamBuffer = lines.pop() || ''; // Keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);

          // Stream event (not a response) - forward to renderer
          if (parsed.type && !parsed.jsonrpc) {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('acp-stream-event', parsed);
            }
            continue;
          }

          // JSON-RPC response
          if (parsed.id !== undefined && parsed.jsonrpc === '2.0') {
            const resolve = pendingRequests.get(parsed.id);
            if (resolve) {
              pendingRequests.delete(parsed.id);
              if (parsed.error) {
                resolve({ error: parsed.error });
              } else {
                resolve({ result: parsed.result });
              }
            }
          }
        } catch (e) {
          // Not JSON, might be console output from agent
          console.log(`Agent: ${trimmed}`);
        }
      }
    });

    // Handle stderr
    agentStderr.on('data', (data) => {
      console.error(`Agent error: ${data}`);
    });

    agentProcess.on('error', (err) => {
      console.error('Failed to start agent:', err);
      reject(err);
    });

    agentProcess.on('close', (code) => {
      console.log(`Agent process exited with code ${code}`);
      agentProcess = null;
      agentStdin = null;
      agentStdout = null;
      agentStderr = null;
    });

    // Signal ready after a short delay (ACP server starts immediately)
    setTimeout(() => {
      console.log('Agent ACP server ready');
      resolve(agentProcess);
    }, 500);
  });
}

// ACP helper - send JSON-RPC request and wait for response
function acpRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!agentStdin || !agentProcess) {
      reject(new Error('Agent not running'));
      return;
    }

    const id = ++requestId;
    pendingRequests.set(id, resolve);

    const req = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    agentStdin.write(req + '\n');

    // Timeout after 120s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`ACP request ${method} timed out`));
      }
    }, 120000);
  });
}

async function initializeApp() {
  try {
    console.log('Starting Meow Desktop...');

    // Start server first
    await startServer();
    console.log('Server started successfully');

    // Create window after server is ready
    createWindow();
    console.log('Window created successfully');

    // Start agent in background (non-blocking)
    startAgent().then(() => {
      console.log('Agent started successfully');
    }).catch((error) => {
      console.error('Failed to start agent:', error);
      // Don't quit the app if agent fails - user can restart it via UI
    });
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
}

app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  console.log('Shutting down processes...');

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }

  if (agentProcess) {
    agentProcess.kill('SIGTERM');
    agentProcess = null;
  }
});

ipcMain.handle('get-app-info', () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    isDev,
    isProd
  };
});

ipcMain.handle('restart-agent', async () => {
  if (agentProcess) {
    agentProcess.kill('SIGTERM');
    agentProcess = null;
  }

  try {
    await startAgent();
    return { success: true, message: 'Agent restarted successfully' };
  } catch (error) {
    return { success: false, message: `Failed to restart agent: ${error.message}` };
  }
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
  return { success: true };
});

// ACP IPC handlers
ipcMain.handle('acp/initialize', async (event, params) => {
  try {
    const result = await acpRequest('initialize', params);
    return result;
  } catch (e) {
    return { error: { code: -32603, message: e.message } };
  }
});

ipcMain.handle('acp/new-session', async () => {
  try {
    return await acpRequest('newSession');
  } catch (e) {
    return { error: { code: -32603, message: e.message } };
  }
});

ipcMain.handle('acp/load-session', async (event, { sessionId }) => {
  try {
    return await acpRequest('loadSession', { sessionId });
  } catch (e) {
    return { error: { code: -32603, message: e.message } };
  }
});

ipcMain.handle('acp/prompt', async (event, { prompt }) => {
  try {
    return await acpRequest('prompt', { prompt });
  } catch (e) {
    return { error: { code: -32603, message: e.message } };
  }
});

ipcMain.handle('acp/prompt-stream', async (event, { prompt }) => {
  try {
    return await acpRequest('prompt/stream', { prompt });
  } catch (e) {
    return { error: { code: -32603, message: e.message } };
  }
});

ipcMain.handle('acp/cancel', async () => {
  try {
    return await acpRequest('cancel');
  } catch (e) {
    return { error: { code: -32603, message: e.message } };
  }
});

ipcMain.handle('acp/tools-list', async () => {
  try {
    return await acpRequest('tools/list');
  } catch (e) {
    return { error: { code: -32603, message: e.message } };
  }
});

ipcMain.handle('acp/tools-call', async (event, { name, args }) => {
  try {
    return await acpRequest('tools/call', { name, args });
  } catch (e) {
    return { error: { code: -32603, message: e.message } };
  }
});

ipcMain.handle('mcp/reload', async () => {
  try {
    return await acpRequest('mcp/reload');
  } catch (e) {
    return { error: { code: -32603, message: e.message } };
  }
});

// Workspace IPC handlers
ipcMain.handle('workspace/set', async (event, { path }) => {
  workspacePath = path || null;
  return { success: true, workspacePath };
});

ipcMain.handle('workspace/get', async () => {
  return { workspacePath };
});

ipcMain.handle('workspace/select', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Workspace Directory'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, workspacePath };
  }
  workspacePath = result.filePaths[0];
  return { canceled: false, workspacePath };
});
