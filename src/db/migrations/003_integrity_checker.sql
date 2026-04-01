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
        RETURN jsonb_build_object('status', 'ok', 'version', '1.0', 'missing_tables', '[]'::jsonb);
    END IF;
END;
$$;
/* SUPABASE_ONLY_END */
