-- Enable pg_cron and pg_net extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the swarms.heartbeat() function to run every 30 minutes
-- This triggers the continuous mode orchestrator webhook
SELECT cron.schedule(
    'swarms-continuous-mode-heartbeat',
    '*/30 * * * *',
    'SELECT swarms.heartbeat()'
);
