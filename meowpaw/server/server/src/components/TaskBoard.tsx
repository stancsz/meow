'use client';

import React, { useEffect, useState } from 'react';

interface TaskResult {
  id: string;
  session_id: string;
  worker_id: string;
  skill_ref: string;
  status: string;
  output: string;
  error: string;
  created_at: string;
}

interface TaskBoardProps {
  sessionId?: string | null;
}

export default function TaskBoard({ sessionId }: TaskBoardProps) {
  const [tasks, setTasks] = useState<TaskResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        if (!sessionId) {
          // Fetch all recent tasks if no session specified
          const res = await fetch('/api/orchestrator/sessions');
          if (!res.ok) throw new Error('Failed to fetch sessions');
          const data = await res.json();

          // Collect all tasks from all sessions
          const allTasks: TaskResult[] = [];
          for (const session of data.sessions || []) {
            const tasksRes = await fetch(`/api/orchestrator/sessions/${session.id}/tasks`);
            if (tasksRes.ok) {
              const tasksData = await tasksRes.json();
              allTasks.push(...(tasksData.tasks || []));
            }
          }
          setTasks(allTasks.slice(0, 50)); // Limit to 50 most recent
        } else {
          const res = await fetch(`/api/orchestrator/sessions/${sessionId}/tasks`);
          if (!res.ok) throw new Error('Failed to fetch tasks');
          const data = await res.json();
          setTasks(data.tasks || []);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load tasks');
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [sessionId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'success':
        return { bg: 'rgba(34, 197, 94, 0.1)', border: '#22c55e', text: '#86efac' };
      case 'error':
      case 'failed':
        return { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#fca5a5' };
      case 'running':
      case 'booting':
      case 'executing':
        return { bg: 'rgba(96, 165, 250, 0.1)', border: '#3b82f6', text: '#93c5fd' };
      case 'pending':
      case 'waiting':
        return { bg: 'rgba(251, 191, 36, 0.1)', border: '#f59e0b', text: '#fbbf24' };
      default:
        return { bg: 'rgba(156, 163, 175, 0.1)', border: '#9ca3af', text: '#d1d5db' };
    }
  };

  const groupedTasks = {
    pending: tasks.filter(t => ['pending', 'waiting', 'waiting_approval'].includes(t.status)),
    running: tasks.filter(t => ['running', 'booting', 'executing'].includes(t.status)),
    completed: tasks.filter(t => ['completed', 'success'].includes(t.status)),
    failed: tasks.filter(t => ['error', 'failed'].includes(t.status)),
  };

  const renderTask = (task: TaskResult) => {
    const colors = getStatusColor(task.status);

    return (
      <div key={task.id} style={{
        background: 'var(--bg-color)',
        borderRadius: '6px',
        border: `1px solid var(--border-color)`,
        padding: '0.75rem',
        marginBottom: '0.5rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>
            {task.worker_id || 'Unknown Worker'}
          </span>
          <span style={{
            padding: '0.15rem 0.4rem',
            borderRadius: '3px',
            fontSize: '0.7rem',
            backgroundColor: colors.bg,
            color: colors.text,
            border: `1px solid ${colors.border}`
          }}>
            {task.status}
          </span>
        </div>

        {task.skill_ref && (
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
            Skill: {task.skill_ref}
          </div>
        )}

        {task.output && typeof task.output === 'string' && (
          <div style={{
            fontSize: '0.75rem',
            color: '#aaa',
            maxHeight: '3rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {task.output.slice(0, 100)}{task.output.length > 100 ? '...' : ''}
          </div>
        )}

        {task.error && (
          <div style={{
            fontSize: '0.75rem',
            color: '#fca5a5',
            maxHeight: '3rem',
            overflow: 'hidden'
          }}>
            Error: {task.error.slice(0, 80)}{task.error.length > 80 ? '...' : ''}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        Loading tasks...
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

  const columnWidth = '23%';
  const columnGap = '1rem';

  return (
    <div style={{ padding: '1rem 0' }}>
      <h3 style={{ margin: '0 0 1.5rem 0', color: '#fff' }}>Task Board</h3>

      <div style={{ display: 'flex', gap: columnGap }}>
        {/* Pending column */}
        <div style={{ flex: columnWidth }}>
          <div style={{
            padding: '0.5rem',
            borderRadius: '6px 6px 0 0',
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            marginBottom: '0',
            textAlign: 'center'
          }}>
            <span style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Pending ({groupedTasks.pending.length})
            </span>
          </div>
          <div style={{
            background: 'rgba(251, 191, 36, 0.05)',
            border: '1px solid rgba(251, 191, 36, 0.2)',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            padding: '0.75rem',
            minHeight: '150px'
          }}>
            {groupedTasks.pending.length === 0 ? (
              <div style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center' }}>No pending tasks</div>
            ) : (
              groupedTasks.pending.map(renderTask)
            )}
          </div>
        </div>

        {/* Running column */}
        <div style={{ flex: columnWidth }}>
          <div style={{
            padding: '0.5rem',
            borderRadius: '6px 6px 0 0',
            background: 'rgba(96, 165, 250, 0.1)',
            border: '1px solid rgba(96, 165, 250, 0.3)',
            marginBottom: '0',
            textAlign: 'center'
          }}>
            <span style={{ color: '#93c5fd', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Running ({groupedTasks.running.length})
            </span>
          </div>
          <div style={{
            background: 'rgba(96, 165, 250, 0.05)',
            border: '1px solid rgba(96, 165, 250, 0.2)',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            padding: '0.75rem',
            minHeight: '150px'
          }}>
            {groupedTasks.running.length === 0 ? (
              <div style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center' }}>No running tasks</div>
            ) : (
              groupedTasks.running.map(renderTask)
            )}
          </div>
        </div>

        {/* Completed column */}
        <div style={{ flex: columnWidth }}>
          <div style={{
            padding: '0.5rem',
            borderRadius: '6px 6px 0 0',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            marginBottom: '0',
            textAlign: 'center'
          }}>
            <span style={{ color: '#86efac', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Completed ({groupedTasks.completed.length})
            </span>
          </div>
          <div style={{
            background: 'rgba(34, 197, 94, 0.05)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            padding: '0.75rem',
            minHeight: '150px'
          }}>
            {groupedTasks.completed.length === 0 ? (
              <div style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center' }}>No completed tasks</div>
            ) : (
              groupedTasks.completed.map(renderTask)
            )}
          </div>
        </div>

        {/* Failed column */}
        <div style={{ flex: columnWidth }}>
          <div style={{
            padding: '0.5rem',
            borderRadius: '6px 6px 0 0',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            marginBottom: '0',
            textAlign: 'center'
          }}>
            <span style={{ color: '#fca5a5', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Failed ({groupedTasks.failed.length})
            </span>
          </div>
          <div style={{
            background: 'rgba(239, 68, 68, 0.05)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            padding: '0.75rem',
            minHeight: '150px'
          }}>
            {groupedTasks.failed.length === 0 ? (
              <div style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center' }}>No failed tasks</div>
            ) : (
              groupedTasks.failed.map(renderTask)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}