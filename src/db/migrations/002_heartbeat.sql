-- Heartbeat Queue infrastructure
CREATE TABLE IF NOT EXISTS heartbeat_queue (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    next_trigger TEXT,
    status TEXT DEFAULT 'pending',
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
