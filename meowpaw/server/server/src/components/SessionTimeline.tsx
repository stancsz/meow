'use client';

import React, { useEffect, useState } from 'react';

interface Session {
  id: string;
  user_id: string;
  status: string;
  context: string;
  created_at: string;
  updated_at: string;
  credits_used: number;
}

interface TaskResult {
  id: string;
  session_id: string;
  worker_id: string;
  skill_ref: string;
  status: string;
  output: string;
  created_at: string;
}

export default function SessionTimeline() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [taskResults, setTaskResults] = useState<Map<string, TaskResult[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/orchestrator/sessions');
        if (!res.ok) throw new Error('Failed to fetch sessions');
        const data = await res.json();
        setSessions(data.sessions || []);

        // Fetch task results for each session
        const taskResultsMap = new Map<string, TaskResult[]>();
        for (const session of data.sessions || []) {
          const resultsRes = await fetch(`/api/orchestrator/sessions/${session.id}/tasks`);
          if (resultsRes.ok) {
            const resultsData = await resultsRes.json();
            taskResultsMap.set(session.id, resultsData.tasks || []);
          }
        }
        setTaskResults(taskResultsMap);
      } catch (err: any) {
        setError(err.message || 'Failed to load timeline');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'executing':
        return { bg: 'rgba(96, 165, 250, 0.1)', border: '#3b82f6', text: '#93c5fd' };
      case 'completed':
        return { bg: 'rgba(34, 197, 94, 0.1)', border: '#16a34a', text: '#86efac' };
      case 'error':
        return { bg: 'rgba(239, 68, 68, 0.1)', border: '#dc2626', text: '#fca5a5' };
      case 'planning':
        return { bg: 'rgba(96, 165, 250, 0.1)', border: '#3b82f6', text: '#93c5fd' };
      case 'waiting_approval':
        return { bg: 'rgba(251, 191, 36, 0.1)', border: '#f59e0b', text: '#fbbf24' };
      default:
        return { bg: 'rgba(156, 163, 175, 0.1)', border: '#9ca3af', text: '#d1d5db' };
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDuration = (session: Session) => {
    const created = new Date(session.created_at);
    const updated = new Date(session.updated_at);
    const diffMs = updated.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return '<1m';
    if (diffMins < 60) return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        Loading timeline...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#fca5a5' }}>
        {error}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        No sessions yet. Create your first bot to see the timeline.
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <h3 style={{ margin: '0 0 1.5rem 0', color: '#fff' }}>Session Timeline</h3>

      <div style={{ position: 'relative' }}>
        {/* Timeline line */}
        <div style={{
          position: 'absolute',
          left: '12px',
          top: 0,
          bottom: 0,
          width: '2px',
          background: 'linear-gradient(to bottom, #3b82f6, #9ca3af)'
        }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sessions.map((session) => {
            const colors = getStatusColor(session.status);
            const sessionTasks = taskResults.get(session.id) || [];
            const completedTasks = sessionTasks.filter(t => t.status === 'completed' || t.status === 'success').length;
            const failedTasks = sessionTasks.filter(t => t.status === 'error' || t.status === 'failed').length;

            return (
              <div key={session.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                {/* Timeline dot */}
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  backgroundColor: colors.bg,
                  border: `2px solid ${colors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1,
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: colors.border
                  }} />
                </div>

                {/* Session card */}
                <div style={{
                  flex: 1,
                  background: 'var(--input-bg)',
                  borderRadius: '8px',
                  border: `1px solid var(--border-color)`,
                  padding: '1rem',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        backgroundColor: colors.bg,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                        display: 'inline-block',
                        marginBottom: '0.5rem'
                      }}>
                        {session.status}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>
                        {session.id.slice(0, 8)}...
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#888' }}>
                      <div>{formatDate(session.created_at)}</div>
                      <div style={{ marginTop: '0.25rem' }}>Duration: {getDuration(session)}</div>
                    </div>
                  </div>

                  {session.context && (
                    <div style={{
                      fontSize: '0.9rem',
                      color: '#ccc',
                      marginBottom: '0.75rem',
                      fontStyle: 'italic'
                    }}>
                      {session.context.slice(0, 100)}{session.context.length > 100 ? '...' : ''}
                    </div>
                  )}

                  {/* Task stats */}
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                    <span style={{ color: '#86efac' }}>
                      {completedTasks} completed
                    </span>
                    {failedTasks > 0 && (
                      <span style={{ color: '#fca5a5' }}>
                        {failedTasks} failed
                      </span>
                    )}
                    {session.credits_used > 0 && (
                      <span style={{ color: '#888' }}>
                        {session.credits_used} credits used
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}