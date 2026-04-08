'use client';

import React, { useState } from 'react';
import SessionTimeline from '@/components/SessionTimeline';
import TaskBoard from '@/components/TaskBoard';
import Link from 'next/link';

type ViewMode = 'timeline' | 'tasks' | 'both';

export default function VisualizationPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('both');

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Visualization</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/" style={{ color: '#00E5CC', textDecoration: 'none', fontSize: '0.9rem' }}>
            Dashboard
          </Link>
        </div>
      </div>

      <main className="dashboard-main">
        {/* View mode selector */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => setViewMode('timeline')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: viewMode === 'timeline' ? '2px solid #00E5CC' : '1px solid var(--border-color)',
              background: viewMode === 'timeline' ? 'rgba(0, 229, 204, 0.1)' : 'var(--input-bg)',
              color: viewMode === 'timeline' ? '#00E5CC' : '#888',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Timeline
          </button>
          <button
            onClick={() => setViewMode('tasks')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: viewMode === 'tasks' ? '2px solid #00E5CC' : '1px solid var(--border-color)',
              background: viewMode === 'tasks' ? 'rgba(0, 229, 204, 0.1)' : 'var(--input-bg)',
              color: viewMode === 'tasks' ? '#00E5CC' : '#888',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Task Board
          </button>
          <button
            onClick={() => setViewMode('both')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: viewMode === 'both' ? '2px solid #00E5CC' : '1px solid var(--border-color)',
              background: viewMode === 'both' ? 'rgba(0, 229, 204, 0.1)' : 'var(--input-bg)',
              color: viewMode === 'both' ? '#00E5CC' : '#888',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Both
          </button>
        </div>

        {/* Content based on view mode */}
        {(viewMode === 'timeline' || viewMode === 'both') && (
          <div style={{
            background: 'var(--input-bg)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <SessionTimeline />
          </div>
        )}

        {(viewMode === 'tasks' || viewMode === 'both') && (
          <div style={{
            background: 'var(--input-bg)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            padding: '1.5rem'
          }}>
            <TaskBoard />
          </div>
        )}
      </main>
    </div>
  );
}