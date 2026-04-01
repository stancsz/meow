/* SUPABASE_ONLY_BEGIN */
-- Enable pg_cron and pg_net extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Verify and configure RLS policies for security over pg_cron schemas if needed
-- pg_cron uses its own schema, but we ensure swarms.heartbeat executes as SECURITY DEFINER

-- Schedule the swarms.heartbeat() function to run every 30 minutes
-- This triggers the continuous mode webhook handler in src/workers/heartbeat.ts
SELECT cron.schedule(
    'swarms-continuous-mode-heartbeat',
    '*/30 * * * *',
    'SELECT swarms.heartbeat()'
);
/* SUPABASE_ONLY_END */
