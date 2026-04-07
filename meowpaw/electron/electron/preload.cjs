const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  restartAgent: () => ipcRenderer.invoke('restart-agent'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  onAgentStatus: (callback) => {
    ipcRenderer.on('agent-status', (event, status) => callback(status));
    return () => ipcRenderer.removeAllListeners('agent-status');
  },

  onServerStatus: (callback) => {
    ipcRenderer.on('server-status', (event, status) => callback(status));
    return () => ipcRenderer.removeAllListeners('server-status');
  }
});

contextBridge.exposeInMainWorld('platform', {
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux'
});

// ACP bridge - exposes meow agent via IPC
contextBridge.exposeInMainWorld('acp', {
  // Initialize ACP session
  initialize: (params) => ipcRenderer.invoke('acp/initialize', params),

  // Session management
  newSession: () => ipcRenderer.invoke('acp/new-session'),
  loadSession: (sessionId) => ipcRenderer.invoke('acp/load-session', { sessionId }),

  // Prompt the agent (non-streaming)
  prompt: (prompt) => ipcRenderer.invoke('acp/prompt', { prompt }),

  // Prompt the agent (streaming) - returns immediately, events via onAcpStream
  promptStream: (prompt) => ipcRenderer.invoke('acp/prompt-stream', { prompt }),

  // Cancel ongoing operation
  cancel: () => ipcRenderer.invoke('acp/cancel'),

  // Tools
  toolsList: () => ipcRenderer.invoke('acp/tools-list'),
  toolsCall: (name, args) => ipcRenderer.invoke('acp/tools-call', { name, args }),

  // MCP
  mcpReload: () => ipcRenderer.invoke('mcp/reload'),

  // Stream events (from streaming prompts)
  onAcpStream: (callback) => {
    ipcRenderer.on('acp-stream-event', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('acp-stream-event');
  }
});

// Workspace IPC
contextBridge.exposeInMainWorld('workspace', {
  set: (path) => ipcRenderer.invoke('workspace/set', { path }),
  get: () => ipcRenderer.invoke('workspace/get'),
  select: () => ipcRenderer.invoke('workspace/select'),
});
