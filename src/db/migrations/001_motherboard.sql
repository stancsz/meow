-- SQLite migration for SimpleClaw local development
-- This simulates the Supabase Sovereign Motherboard locally

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
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    credits_used INTEGER DEFAULT 0
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

-- Heartbeat Queue Table (Phase 2 Continuous Mode)
-- Matches SWARM_SPEC.md §9.2 specification exactly
CREATE TABLE IF NOT EXISTS heartbeat_queue (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    next_trigger TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gas_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    balance_credits INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    credits_used INTEGER DEFAULT 0
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

CREATE TABLE IF NOT EXISTS platform_users (
    user_id TEXT PRIMARY KEY,
    supabase_url TEXT NOT NULL,
    encrypted_service_role TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

/* SUPABASE_ONLY_BEGIN */
-- Heartbeat processor for Continuous Mode (runs as DB owner)
-- This function is called by pg_cron or an external scheduler to trigger the API webhook
CREATE OR REPLACE FUNCTION swarms.heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT;
    r RECORD;
BEGIN
    -- Read webhook URL from platform settings to avoid hardcoding production URLs
    v_url := current_setting('app.settings.orchestrator_webhook_url', true);

    IF v_url IS NULL OR v_url = '' THEN
        -- Fallback if setting is not configured
        v_url := 'https://api.beautifulswarms.com/api/heartbeat';
    END IF;

    -- Iterate over all pending heartbeats that are due
    -- We do not update the status to 'processing' here to avoid stuck states if the webhook fails.
    -- The webhook API endpoint itself handles the state transition to 'processing'.
    FOR r IN
        SELECT id, session_id
        FROM heartbeat_queue
        WHERE status = 'pending' AND next_trigger <= NOW()
    LOOP
        -- Invoke the Orchestrator Webhook via pg_net
        PERFORM net.http_post(
            url := v_url,
            body := jsonb_build_object('session_id', r.session_id)
        );
    END LOOP;
END;
$$;
/* SUPABASE_ONLY_END */
/* SUPABASE_ONLY_BEGIN */
-- Verify Motherboard Integrity
CREATE OR REPLACE FUNCTION swarms.verify_motherboard_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_missing_tables text[] := '{}';
    v_table text;
    v_tables_to_check text[] := ARRAY['vault_user_secrets', 'orchestrator_sessions', 'task_results', 'audit_log', 'transaction_log', 'heartbeat_queue', 'gas_ledger', 'skill_refs', 'platform_users'];
BEGIN
    FOREACH v_table IN ARRAY v_tables_to_check
    LOOP
        IF NOT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = v_table
        ) THEN
            v_missing_tables := array_append(v_missing_tables, v_table);
        END IF;
    END LOOP;

    IF cardinality(v_missing_tables) > 0 THEN
        RETURN jsonb_build_object('status', 'error', 'version', '1.0', 'missing_tables', v_missing_tables);
    ELSE
        RETURN jsonb_build_object('status', 'ok', 'version', '1.0', 'missing_tables', '[]');
    END IF;
END;
$$;
/* SUPABASE_ONLY_END */
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
