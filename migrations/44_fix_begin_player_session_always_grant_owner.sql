-- Migration 44: Fix begin_player_session to always grant immediately
-- 
-- Problem: When a user already has an active session (within 16 minutes),
-- begin_player_session returns 'wait'. Then resolve_player_login_attempt
-- calls assert_profile_owner which fails with "Profile access denied"
-- (auth.uid() appears to be in a different state 3 seconds later).
--
-- Fix: Since assert_profile_owner already verified that the CALLER owns
-- this profile (via Supabase Auth), we should ALWAYS grant immediately.
-- Only the legitimate owner can authenticate and call this function.
-- The old 'wait' mechanism was designed to prevent unauthorized takeovers,
-- but ownership is already verified upfront - no need to wait.

CREATE OR REPLACE FUNCTION public.begin_player_session(
  p_profile_id uuid,
  p_session_id uuid,
  p_wait_seconds int DEFAULT 60
)
RETURNS TABLE(status text, wait_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session public.player_sessions%ROWTYPE;
BEGIN
  -- Verify caller owns this profile
  PERFORM public.assert_profile_owner(p_profile_id);

  SELECT *
  INTO v_session
  FROM public.player_sessions
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- No existing session - create and grant
    INSERT INTO public.player_sessions (profile_id, session_id, last_activity_at, warning_until, waiting_session_id, updated_at)
    VALUES (p_profile_id, p_session_id, now(), NULL, NULL, now());

    PERFORM public.cleanup_player_logout(p_profile_id);

    RETURN QUERY SELECT 'granted'::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Existing session found - always grant immediately since ownership is verified.
  -- The caller authenticated via Supabase Auth, so they ARE the legitimate owner.
  -- Override any stale or active session.
  UPDATE public.player_sessions
  SET session_id         = p_session_id,
      last_activity_at   = now(),
      warning_until      = NULL,
      waiting_session_id = NULL,
      updated_at         = now()
  WHERE profile_id = p_profile_id;

  PERFORM public.cleanup_player_logout(p_profile_id);

  RETURN QUERY SELECT 'granted'::text, NULL::timestamptz;
END;
$$;
