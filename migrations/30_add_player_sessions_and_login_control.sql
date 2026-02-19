-- Migration: 30_add_player_sessions_and_login_control
-- Purpose: Enforce single active player session with 1-minute takeover warning flow

CREATE TABLE IF NOT EXISTS public.player_sessions (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid,
  last_activity_at timestamptz,
  warning_until timestamptz,
  waiting_session_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_sessions_session_id_idx ON public.player_sessions(session_id);
CREATE INDEX IF NOT EXISTS player_sessions_last_activity_idx ON public.player_sessions(last_activity_at);

ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "player_sessions_read_write" ON public.player_sessions
    FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.begin_player_session(
  p_profile_id uuid,
  p_session_id uuid,
  p_wait_seconds integer DEFAULT 60
)
RETURNS TABLE(status text, wait_until timestamptz)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_session public.player_sessions%ROWTYPE;
  v_wait_until timestamptz;
BEGIN
  SELECT *
  INTO v_session
  FROM public.player_sessions
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.player_sessions (profile_id, session_id, last_activity_at, warning_until, waiting_session_id, updated_at)
    VALUES (p_profile_id, p_session_id, now(), NULL, NULL, now());

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

CREATE OR REPLACE FUNCTION public.touch_player_session_activity(
  p_profile_id uuid,
  p_session_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_session public.player_sessions%ROWTYPE;
BEGIN
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

CREATE OR REPLACE FUNCTION public.resolve_player_login_attempt(
  p_profile_id uuid,
  p_waiting_session_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_session public.player_sessions%ROWTYPE;
BEGIN
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

  RETURN 'granted';
END;
$function$;

CREATE OR REPLACE FUNCTION public.end_player_session(
  p_profile_id uuid,
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.player_sessions
  SET session_id = NULL,
      warning_until = NULL,
      waiting_session_id = NULL,
      updated_at = now()
  WHERE profile_id = p_profile_id
    AND session_id = p_session_id;
END;
$function$;