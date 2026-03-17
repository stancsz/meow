'use client';

import React, { useState, useEffect } from 'react';

type Key = {
  id: string;
  name: string;
  provider: string;
  maskedKey: string;
  createdAt: string;
};

export default function KeyManager() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('openai');
  const [secret, setSecret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/keys');
      if (!res.ok) {
        throw new Error('Failed to fetch keys');
      }
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err: any) {
      setError(err.message || 'An error occurred fetching keys.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim()) {
      setError('Secret value is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim() || undefined, // Send undefined if empty so route uses default
          provider,
          secret: secret.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to add key');
      }

      // Reset form
      setName('');
      setSecret('');

      // Refresh list
      await fetchKeys();
    } catch (err: any) {
      setError(err.message || 'An error occurred adding the key.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this key? Tasks using this key will fail.')) {
      return;
    }

    setError(null);
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete key');
      }

      // Refresh list
      await fetchKeys();
    } catch (err: any) {
      setError(err.message || 'An error occurred deleting the key.');
    }
  };

  return (
    <div className="key-manager">
      <h2>Your API Keys (BYOK)</h2>
      <p style={{ color: '#888', marginBottom: '2rem' }}>
        Keys are securely encrypted using GCP KMS and stored in your sovereign Supabase Vault.
        The platform never stores your plaintext keys.
      </p>

      {error && (
        <div className="status-message error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="bots-list-section" style={{ marginBottom: '2rem' }}>
        <h3>Stored Keys</h3>
        {isLoading ? (
          <p>Loading keys...</p>
        ) : keys.length === 0 ? (
          <p style={{ color: '#888', fontStyle: 'italic' }}>No keys found. Add one below.</p>
        ) : (
          <ul className="bots-list">
            {keys.map((key) => (
              <li key={key.id} className="bot-item" style={{ alignItems: 'center' }}>
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{key.name}</strong>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#aaa' }}>
                    <span style={{
                      background: '#1a1a1a',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid #333'
                    }}>
                      {key.provider}
                    </span>
                    <span style={{ fontFamily: 'monospace' }}>{key.maskedKey}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteKey(key.id)}
                  className="btn-secondary"
                  style={{ flex: 0, padding: '0.5rem 1rem', borderColor: '#ef4444', color: '#ef4444' }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="create-bot-section">
        <h3>Add New Key</h3>
        <form onSubmit={handleAddKey} className="form-container">
          <div className="input-group">
            <label htmlFor="name">Key Name (Optional)</label>
            <input
              id="name"
              type="text"
              className="input-field"
              placeholder="e.g., Production OpenAI Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="input-group">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              className="input-field"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={isSubmitting}
              style={{ appearance: 'auto' }}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="deepseek">DeepSeek</option>
              <option value="google">Google (Gemini)</option>
              <option value="shopify">Shopify</option>
              <option value="github">GitHub</option>
              <option value="slack">Slack</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="secret">Secret Value</label>
            <textarea
              id="secret"
              className="input-field"
              placeholder="sk-..."
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              disabled={isSubmitting}
              style={{ minHeight: '80px', fontFamily: 'monospace' }}
            />
          </div>

          <div className="button-group">
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !secret.trim()}
            >
              {isSubmitting ? 'Encrypting & Saving...' : 'Add Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
