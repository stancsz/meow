-- SQLite migration for SimpleClaw local integration tests
-- This ensures all required tables for testing orchestrator e2e flow exist
-- Similar to src/db/migrations/001_motherboard.sql

CREATE TABLE IF NOT EXISTS platform_users (
    user_id TEXT PRIMARY KEY,
    supabase_url TEXT NOT NULL,
    encrypted_service_role TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vault_user_secrets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    secret TEXT NOT NULL,
    provider TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orchestrator_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    context TEXT,
    manifest TEXT,
    continuous_mode INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_results (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES orchestrator_sessions(id),
    worker_id TEXT,
    skill_ref TEXT,
    status TEXT,
    output TEXT,
    error TEXT,
    worker_metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    event TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transaction_log (
    idempotency_key TEXT PRIMARY KEY,
    status TEXT,
    result TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gas_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    balance_credits INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS heartbeat_queue (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    next_trigger TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skill_refs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    source TEXT,
    ref TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
/* SUPABASE_ONLY_BEGIN */
-- Enable pg_cron and pg_net extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the swarms.heartbeat() function to run every 30 minutes
-- This calls the function created in 002_heartbeat.sql
SELECT cron.schedule(
    'swarms-continuous-mode-heartbeat',
    '*/30 * * * *',
    'SELECT swarms.heartbeat()'
);
/* SUPABASE_ONLY_END */

/* SUPABASE_ONLY_BEGIN */
ALTER TABLE task_results ADD COLUMN IF NOT EXISTS worker_metadata TEXT;
/* SUPABASE_ONLY_END */

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
