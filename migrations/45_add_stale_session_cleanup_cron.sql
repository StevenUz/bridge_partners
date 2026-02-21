-- Migration: 45_add_stale_session_cleanup_cron
-- Purpose: Server-side periodic cleanup of ghost seats for inactive players.
--          Runs every 2 minutes via pg_cron, independent of any client activity.

-- Enable pg_cron extension (safe to run if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage on the cron schema to postgres (required for scheduling)
GRANT USAGE ON SCHEMA cron TO postgres;

-- ─────────────────────────────────────────────────────────────
-- Function: cleanup_stale_sessions
-- Removes room seats and room memberships for every player whose
-- last_activity_at has not been touched in the last 16 minutes,
-- and marks that player_sessions row as ended (session_id = NULL).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stale_id uuid;
BEGIN
  FOR stale_id IN
    SELECT profile_id
    FROM public.player_sessions
    WHERE last_activity_at < now() - interval '16 minutes'
      AND session_id IS NOT NULL
  LOOP
    -- Remove seats and observer memberships (reuse existing function)
    PERFORM public.cleanup_player_logout(stale_id);

    -- Mark the session as ended so the next login gets a clean grant
    UPDATE public.player_sessions
    SET session_id         = NULL,
        warning_until      = NULL,
        waiting_session_id = NULL,
        updated_at         = now()
    WHERE profile_id = stale_id;
  END LOOP;
END;
$$;

-- Allow the postgres role to execute this (pg_cron jobs run as postgres)
GRANT EXECUTE ON FUNCTION public.cleanup_stale_sessions() TO postgres;

-- ─────────────────────────────────────────────────────────────
-- Schedule: every 2 minutes
-- ─────────────────────────────────────────────────────────────

-- Remove any old job with this name first (idempotent)
SELECT cron.unschedule('cleanup-stale-sessions')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-sessions'
);

SELECT cron.schedule(
  'cleanup-stale-sessions',          -- job name
  '*/2 * * * *',                     -- every 2 minutes
  'SELECT public.cleanup_stale_sessions()'
);
