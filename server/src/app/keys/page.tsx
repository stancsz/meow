import React from 'react';
import Link from 'next/link';
import KeyManager from '../../components/KeyManager';

export default function KeysPage() {
  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Sovereign Vault</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/" style={{ color: '#00E5CC', textDecoration: 'none', fontSize: '0.9rem' }}>
            &larr; Back to Dashboard
          </Link>
          <div style={{ fontSize: '0.9rem', color: '#888' }}>Phase 1: BYOK Integration</div>
        </div>
      </div>

      <main className="dashboard-main">
        <KeyManager />
      </main>
    </div>
  );
}
