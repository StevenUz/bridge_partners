-- Migration: 33_adopt_supabase_auth_jwt
-- Purpose: Use Supabase Auth (JWT) for authentication/authorization

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_unique_idx
ON public.profiles(auth_user_id)
WHERE auth_user_id IS NOT NULL;

UPDATE public.profiles p
SET auth_user_id = au.id
FROM auth.users au
WHERE p.auth_user_id IS NULL
  AND p.email IS NOT NULL
  AND au.email IS NOT NULL
  AND lower(p.email) = lower(au.email);

CREATE OR REPLACE FUNCTION public.upsert_current_profile(
  p_username text DEFAULT NULL,
  p_display_name text DEFAULT NULL
)
RETURNS TABLE(profile_id uuid, username text, display_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_auth_user_id uuid;
  v_email text;
  v_username text;
  v_display_name text;
  v_profile_id uuid;
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT u.email, u.raw_user_meta_data->>'username', u.raw_user_meta_data->>'display_name'
  INTO v_email, v_username, v_display_name
  FROM auth.users u
  WHERE u.id = v_auth_user_id;

  v_username := COALESCE(NULLIF(btrim(p_username), ''), NULLIF(btrim(v_username), ''), NULLIF(split_part(v_email, '@', 1), ''), 'player_' || substr(v_auth_user_id::text, 1, 8));
  v_display_name := COALESCE(NULLIF(btrim(p_display_name), ''), NULLIF(btrim(v_display_name), ''), v_username);

  SELECT p.id
  INTO v_profile_id
  FROM public.profiles p
  WHERE p.auth_user_id = v_auth_user_id
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    SELECT p.id
    INTO v_profile_id
    FROM public.profiles p
    WHERE p.email IS NOT NULL
      AND v_email IS NOT NULL
      AND lower(p.email) = lower(v_email)
    LIMIT 1;
  END IF;

  IF v_profile_id IS NULL THEN
    v_profile_id := gen_random_uuid();

    INSERT INTO public.profiles (id, auth_user_id, username, display_name, email)
    VALUES (v_profile_id, v_auth_user_id, v_username, v_display_name, v_email);
  ELSE
    UPDATE public.profiles p
    SET auth_user_id = v_auth_user_id,
        username = COALESCE(NULLIF(btrim(p.username), ''), v_username),
        display_name = COALESCE(NULLIF(btrim(p.display_name), ''), v_display_name),
        email = COALESCE(p.email, v_email)
    WHERE p.id = v_profile_id;
  END IF;

  INSERT INTO public.player_statistics (player_id)
  VALUES (v_profile_id)
  ON CONFLICT (player_id) DO NOTHING;

  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.email
  FROM public.profiles p
  WHERE p.id = v_profile_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_current_profile(text, text) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_sessions_read_write" ON public.player_sessions;
DROP POLICY IF EXISTS "player_sessions_select_own" ON public.player_sessions;
DROP POLICY IF EXISTS "player_sessions_insert_own" ON public.player_sessions;
DROP POLICY IF EXISTS "player_sessions_update_own" ON public.player_sessions;
DROP POLICY IF EXISTS "player_sessions_delete_own" ON public.player_sessions;

CREATE POLICY "player_sessions_select_own"
  ON public.player_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = player_sessions.profile_id
        AND p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "player_sessions_insert_own"
  ON public.player_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = player_sessions.profile_id
        AND p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "player_sessions_update_own"
  ON public.player_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = player_sessions.profile_id
        AND p.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = player_sessions.profile_id
        AND p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "player_sessions_delete_own"
  ON public.player_sessions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = player_sessions.profile_id
        AND p.auth_user_id = auth.uid()
    )
  );
