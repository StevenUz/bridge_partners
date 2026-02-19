-- Migration: 41_fix_player_sessions_rls_with_definer
-- Purpose: Prevent login failures from player_sessions RLS by enforcing ownership in SECURITY DEFINER RPCs

CREATE OR REPLACE FUNCTION public.assert_profile_owner(
  p_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_auth_user_id uuid;
BEGIN
  SELECT p.auth_user_id
  INTO v_auth_user_id
  FROM public.profiles p
  WHERE p.id = p_profile_id
  LIMIT 1;

  IF v_auth_user_id IS NULL OR v_auth_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Profile access denied';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.assert_profile_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.begin_player_session(
  p_profile_id uuid,
  p_session_id uuid,
  p_wait_seconds integer DEFAULT 60
)
RETURNS TABLE(status text, wait_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_session public.player_sessions%ROWTYPE;
  v_wait_until timestamptz;
BEGIN
  PERFORM public.assert_profile_owner(p_profile_id);

  SELECT *
  INTO v_session
  FROM public.player_sessions
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.player_sessions (profile_id, session_id, last_activity_at, warning_until, waiting_session_id, updated_at)
    VALUES (p_profile_id, p_session_id, now(), NULL, NULL, now());

    PERFORM public.cleanup_player_logout(p_profile_id);

    RETURN QUERY SELECT 'granted'::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_session.session_id IS NULL
     OR v_session.last_activity_at IS NULL
     OR v_session.last_activity_at < now() - interval '16 minutes'
     OR v_session.session_id = p_session_id THEN
    UPDATE public.player_sessions
    SET session_id = p_session_id,
        last_activity_at = now(),
        warning_until = NULL,
        waiting_session_id = NULL,
        updated_at = now()
    WHERE profile_id = p_profile_id;

    PERFORM public.cleanup_player_logout(p_profile_id);

    RETURN QUERY SELECT 'granted'::text, NULL::timestamptz;
    RETURN;
  END IF;

  v_wait_until := now() + make_interval(secs => GREATEST(COALESCE(p_wait_seconds, 60), 1));

  UPDATE public.player_sessions
  SET warning_until = v_wait_until,
      waiting_session_id = p_session_id,
      updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN QUERY SELECT 'wait'::text, v_wait_until;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.begin_player_session(uuid, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_player_login_attempt(
  p_profile_id uuid,
  p_waiting_session_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_session public.player_sessions%ROWTYPE;
BEGIN
  PERFORM public.assert_profile_owner(p_profile_id);

  SELECT *
  INTO v_session
  FROM public.player_sessions
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.player_sessions (profile_id, session_id, last_activity_at, warning_until, waiting_session_id, updated_at)
    VALUES (p_profile_id, p_waiting_session_id, now(), NULL, NULL, now())
    ON CONFLICT (profile_id) DO UPDATE
      SET session_id = EXCLUDED.session_id,
          last_activity_at = now(),
          warning_until = NULL,
          waiting_session_id = NULL,
          updated_at = now();

    PERFORM public.cleanup_player_logout(p_profile_id);

    RETURN 'granted';
  END IF;

  IF v_session.session_id = p_waiting_session_id THEN
    RETURN 'granted';
  END IF;

  IF v_session.waiting_session_id IS DISTINCT FROM p_waiting_session_id THEN
    RETURN 'denied';
  END IF;

  IF v_session.warning_until IS NULL THEN
    RETURN 'denied';
  END IF;

  IF now() < v_session.warning_until THEN
    RETURN 'wait';
  END IF;

  UPDATE public.player_sessions
  SET session_id = p_waiting_session_id,
      last_activity_at = now(),
      warning_until = NULL,
      waiting_session_id = NULL,
      updated_at = now()
  WHERE profile_id = p_profile_id;

  PERFORM public.cleanup_player_logout(p_profile_id);

  RETURN 'granted';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_player_login_attempt(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_player_session_activity(
  p_profile_id uuid,
  p_session_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_session public.player_sessions%ROWTYPE;
BEGIN
  PERFORM public.assert_profile_owner(p_profile_id);

  SELECT *
  INTO v_session
  FROM public.player_sessions
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_session.session_id IS DISTINCT FROM p_session_id THEN
    RETURN 'replaced';
  END IF;

  UPDATE public.player_sessions
  SET last_activity_at = now(),
      warning_until = NULL,
      waiting_session_id = NULL,
      updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN 'ok';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.touch_player_session_activity(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_player_session(
  p_profile_id uuid,
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_profile_owner(p_profile_id);

  UPDATE public.player_sessions
  SET session_id = NULL,
      warning_until = NULL,
      waiting_session_id = NULL,
      updated_at = now()
  WHERE profile_id = p_profile_id
    AND session_id = p_session_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.end_player_session(uuid, uuid) TO authenticated;
