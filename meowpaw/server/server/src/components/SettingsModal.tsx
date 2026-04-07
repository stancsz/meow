'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface MCPServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath: string | null;
  onWorkspaceSelect: () => void;
}

declare global {
  interface Window {
    acp: {
      mcpReload: () => Promise<any>;
    };
  }
}

interface MCPServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath: string | null;
  onWorkspaceSelect: () => void;
}

export default function SettingsModal({ isOpen, onClose, workspacePath, onWorkspaceSelect }: SettingsModalProps) {
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [newServer, setNewServer] = useState<MCPServer>({ name: '', command: '', args: [] });
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadMCPServers();
    }
  }, [isOpen]);

  const loadMCPServers = async () => {
    try {
      const res = await fetch('/api/mcp');
      if (res.ok) {
        const data = await res.json();
        setMcpServers(data.servers || []);
      }
    } catch (e) {
      // API might not exist yet
      setMcpServers([]);
    }
  };

  const saveMCPServers = async (servers: MCPServer[]) => {
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers }),
      });
      if (!res.ok) throw new Error('Failed to save MCP config');
      setMcpServers(servers);
      setError(null);
      // Reload MCP tools in the agent
      if (window.acp?.mcpReload) {
        window.acp.mcpReload();
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAddServer = useCallback(() => {
    if (!newServer.name.trim() || !newServer.command.trim()) {
      setError('Name and command are required');
      return;
    }
    const updated = [...mcpServers, { ...newServer }];
    saveMCPServers(updated);
    setNewServer({ name: '', command: '', args: [] });
    setShowAddForm(false);
  }, [newServer, mcpServers]);

  const handleRemoveServer = useCallback((name: string) => {
    const updated = mcpServers.filter(s => s.name !== name);
    saveMCPServers(updated);
  }, [mcpServers]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="modal-body">
          {/* Workspace Section */}
          <section className="settings-section">
            <h3>Workspace</h3>
            <div className="setting-row">
              <span className="setting-label">Current workspace:</span>
              <span className="setting-value">{workspacePath || 'Not set'}</span>
            </div>
            <button onClick={onWorkspaceSelect} className="btn-secondary">
              {workspacePath ? 'Change Workspace' : 'Select Workspace'}
            </button>
          </section>

          {/* MCP Servers Section */}
          <section className="settings-section">
            <h3>MCP Connectors</h3>
            <p className="section-desc">Configure MCP servers to extend Meow's capabilities.</p>

            {error && <div className="error-msg">{error}</div>}

            <div className="server-list">
              {mcpServers.map(server => (
                <div key={server.name} className="server-item">
                  <div className="server-info">
                    <strong>{server.name}</strong>
                    <code>{server.command} {server.args?.join(' ')}</code>
                  </div>
                  <button onClick={() => handleRemoveServer(server.name)} className="btn-danger">
                    Remove
                  </button>
                </div>
              ))}
              {mcpServers.length === 0 && !showAddForm && (
                <p className="empty-msg">No MCP servers configured.</p>
              )}
            </div>

            {showAddForm ? (
              <div className="add-form">
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={newServer.name}
                    onChange={e => setNewServer(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., notion"
                  />
                </div>
                <div className="form-group">
                  <label>Command</label>
                  <input
                    type="text"
                    value={newServer.command}
                    onChange={e => setNewServer(prev => ({ ...prev, command: e.target.value }))}
                    placeholder="e.g., npx"
                  />
                </div>
                <div className="form-group">
                  <label>Args (comma-separated)</label>
                  <input
                    type="text"
                    value={newServer.args?.join(', ') || ''}
                    onChange={e => setNewServer(prev => ({ ...prev, args: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                    placeholder="e.g., -y, @notionhq/notion"
                  />
                </div>
                <div className="form-actions">
                  <button onClick={handleAddServer} className="btn-primary">Add</button>
                  <button onClick={() => { setShowAddForm(false); setError(null); }} className="btn-secondary">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddForm(true)} className="btn-secondary">
                Add MCP Server
              </button>
            )}
          </section>
        </div>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
          }
          .modal-content {
            background: var(--input-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            width: 500px;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            border-bottom: 1px solid var(--border-color);
          }
          .modal-header h2 { margin: 0; font-size: 1.25rem; }
          .close-btn {
            background: none;
            border: none;
            color: #888;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0;
            line-height: 1;
          }
          .modal-body { padding: 1rem; overflow-y: auto; }
          .settings-section { margin-bottom: 1.5rem; }
          .settings-section h3 { margin: 0 0 0.5rem; font-size: 1rem; color: var(--text-color); }
          .section-desc { color: #888; font-size: 0.85rem; margin-bottom: 0.75rem; }
          .setting-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.9rem; }
          .setting-label { color: #888; }
          .setting-value { color: var(--text-color); word-break: break-all; }
          .error-msg { background: rgba(220,38,38,0.2); border: 1px solid #dc2626; color: #fca5a5; padding: 0.5rem; border-radius: 4px; margin-bottom: 0.75rem; font-size: 0.85rem; }
          .server-list { margin-bottom: 1rem; }
          .server-item { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--bg-color); border-radius: 4px; margin-bottom: 0.5rem; }
          .server-info { display: flex; flex-direction: column; gap: 0.25rem; }
          .server-info strong { font-size: 0.9rem; }
          .server-info code { font-size: 0.75rem; color: #888; }
          .empty-msg { color: #666; font-size: 0.85rem; }
          .add-form { background: var(--bg-color); padding: 1rem; border-radius: 4px; margin-bottom: 0.75rem; }
          .form-group { margin-bottom: 0.75rem; }
          .form-group label { display: block; font-size: 0.85rem; color: #888; margin-bottom: 0.25rem; }
          .form-group input { width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-color); font-size: 0.9rem; }
          .form-actions { display: flex; gap: 0.5rem; }
          .btn-primary { padding: 0.5rem 1rem; background: var(--accent-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
          .btn-secondary { padding: 0.5rem 1rem; background: transparent; color: var(--text-color); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
          .btn-danger { padding: 0.25rem 0.75rem; background: transparent; color: #dc2626; border: 1px solid #dc2626; border-radius: 4px; cursor: pointer; font-size: 0.75rem; }
        `}</style>
      </div>
    </div>
  );
}
