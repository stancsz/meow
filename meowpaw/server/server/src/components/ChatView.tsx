'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

interface StreamEvent {
  type: 'content' | 'tool_start' | 'tool_end' | 'done' | 'error';
  content?: string;
  toolName?: string;
  toolResult?: string;
  error?: string;
}

interface ToolCall {
  name: string;
  status: 'pending' | 'done';
  result?: string;
}

declare global {
  interface Window {
    acp: {
      initialize: (params?: { dangerous?: boolean }) => Promise<any>;
      newSession: () => Promise<any>;
      loadSession: (sessionId: string) => Promise<any>;
      prompt: (prompt: string) => Promise<{ content: string; usage: any }>;
      promptStream: (prompt: string) => Promise<any>;
      cancel: () => Promise<{ cancelled: boolean }>;
      toolsList: () => Promise<any[]>;
      toolsCall: (name: string, args: Record<string, unknown>) => Promise<any>;
      onAcpStream: (callback: (event: StreamEvent) => void) => () => void;
    };
  }
}

export default function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [isAcpReady, setIsAcpReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Initialize ACP on mount
  useEffect(() => {
    const initAcp = async () => {
      try {
        const result = await window.acp.initialize({ dangerous: true });
        console.log('ACP initialized:', result);
        setIsAcpReady(true);

        // Create new session
        await window.acp.newSession();
      } catch (e: any) {
        console.error('ACP init failed:', e);
        setError('Failed to initialize agent: ' + e.message);
      }
    };

    initAcp();
  }, []);

  // Subscribe to stream events
  useEffect(() => {
    if (!isAcpReady) return;

    const unsubscribe = window.acp.onAcpStream((event: StreamEvent) => {
      switch (event.type) {
        case 'content':
          setStreamingContent(prev => prev + (event.content || ''));
          break;
        case 'tool_start':
          setToolCalls(prev => [...prev, { name: event.toolName || 'unknown', status: 'pending' }]);
          break;
        case 'tool_end':
          setToolCalls(prev => prev.map((tc, i) =>
            i === prev.length - 1 ? { ...tc, status: 'done', result: event.toolResult } : tc
          ));
          break;
        case 'done':
          setIsStreaming(false);
          setStreamingContent('');
          setToolCalls([]);
          break;
        case 'error':
          setIsStreaming(false);
          setError(event.error || 'Unknown error');
          setStreamingContent('');
          setToolCalls([]);
          break;
      }
    });

    return unsubscribe;
  }, [isAcpReady]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setStreamingContent('');
    setToolCalls([]);
    setError(null);

    // Add placeholder for assistant
    const assistantMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    }]);

    try {
      // Start streaming - events come via onAcpStream callback
      await window.acp.promptStream(userMessage.content);
    } catch (e: any) {
      setIsStreaming(false);
      setError(e.message);
      // Remove placeholder on error
      setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
    }
  }, [input, isStreaming]);

  // Update last message with streaming content
  useEffect(() => {
    if (streamingContent && messages.length > 0) {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, content: streamingContent }];
        }
        return prev;
      });
    }
  }, [streamingContent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleStreaming = () => {
    setIsStreaming(prev => !prev);
  };

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div className="flex items-center gap-3">
          <div className={`status-dot ${isAcpReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
          <span className="text-sm text-[#888]">
            {isAcpReady ? 'Meow connected' : 'Connecting...'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleStreaming}
            className="text-xs px-2 py-1 rounded border border-[#333] text-[#888] hover:border-[#555]"
          >
            {isStreaming ? 'Stop' : 'Stream'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="text-4xl mb-4">🐱</div>
            <p className="text-[#888]">Send a message to start chatting with Meow</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-role">{msg.role === 'user' ? 'You' : 'Meow'}</div>
            <div className="message-content">
              {msg.content.split('\n').map((line, i) => (
                <span key={i}>{line}{i < msg.content.split('\n').length - 1 ? <br /> : null}</span>
              ))}
            </div>
          </div>
        ))}

        {/* Tool calls */}
        {toolCalls.length > 0 && (
          <div className="tool-calls">
            {toolCalls.map((tc, i) => (
              <div key={i} className={`tool-call ${tc.status}`}>
                <span className="tool-name">{tc.name}</span>
                {tc.status === 'pending' && <span className="tool-spinner" />}
                {tc.status === 'done' && tc.result && (
                  <pre className="tool-result">{tc.result.slice(0, 200)}</pre>
                )}
              </div>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)} className="error-close">×</button>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isStreaming || !isAcpReady}
          rows={1}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isStreaming || !isAcpReady}
          className="send-button"
        >
          {isStreaming ? '...' : 'Send'}
        </button>
      </div>

      <style jsx>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: var(--bg-color);
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border-color);
          background: var(--input-bg);
          -webkit-app-region: drag;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-color);
        }

        .message {
          margin-bottom: 1rem;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          max-width: 80%;
        }

        .message.user {
          background: var(--accent-color);
          color: white;
          margin-left: auto;
        }

        .message.assistant {
          background: var(--input-bg);
          color: var(--text-color);
          border: 1px solid var(--border-color);
        }

        .message-role {
          font-size: 0.75rem;
          opacity: 0.7;
          margin-bottom: 0.25rem;
        }

        .message-content {
          white-space: pre-wrap;
          word-break: break-word;
        }

        .tool-calls {
          background: var(--input-bg);
          border: 1px solid #333;
          border-radius: 4px;
          padding: 0.5rem;
          margin-bottom: 1rem;
        }

        .tool-call {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          padding: 0.25rem 0;
        }

        .tool-name {
          font-family: monospace;
          font-size: 0.85rem;
          color: #00E5CC;
        }

        .tool-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid #333;
          border-top-color: #00E5CC;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .tool-result {
          font-size: 0.75rem;
          color: #888;
          overflow: hidden;
          text-overflow: ellipsis;
          max-height: 60px;
          margin: 0;
          white-space: pre-wrap;
        }

        .error-banner {
          background: rgba(220, 38, 38, 0.2);
          border: 1px solid #dc2626;
          color: #fca5a5;
          padding: 0.5rem 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .error-close {
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          font-size: 1.25rem;
        }

        .chat-input-area {
          display: flex;
          gap: 0.5rem;
          padding: 1rem;
          border-top: 1px solid var(--border-color);
          background: var(--input-bg);
        }

        .chat-input-area textarea {
          flex: 1;
          padding: 0.75rem;
          border-radius: 4px;
          border: 1px solid var(--border-color);
          background: var(--bg-color);
          color: var(--text-color);
          resize: none;
          font-family: inherit;
          font-size: 1rem;
        }

        .chat-input-area textarea:focus {
          outline: none;
          border-color: var(--accent-color);
        }

        .send-button {
          padding: 0.75rem 1.5rem;
          border-radius: 4px;
          border: none;
          background: var(--accent-color);
          color: white;
          cursor: pointer;
          font-weight: 500;
        }

        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
