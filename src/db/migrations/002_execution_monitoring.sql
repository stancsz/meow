-- SQLite migration for SimpleClaw local development
-- This simulates the Supabase Sovereign Motherboard locally

-- 1. Add worker_metadata column to task_results
ALTER TABLE task_results ADD COLUMN IF NOT EXISTS worker_metadata TEXT;

-- 2. Create execution_summary view aggregating session statistics
CREATE VIEW IF NOT EXISTS execution_summary AS
SELECT
    session_id,
    COUNT(id) as total_tasks,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_tasks,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed_tasks,
    MIN(created_at) as started_at,
    MAX(created_at) as last_updated_at
FROM task_results
GROUP BY session_id;

-- 3. Add indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_task_results_session_id ON task_results(session_id);
CREATE INDEX IF NOT EXISTS idx_task_results_worker_id ON task_results(worker_id);
CREATE INDEX IF NOT EXISTS idx_task_results_status ON task_results(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_session_id ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_orchestrator_sessions_status ON orchestrator_sessions(status);
