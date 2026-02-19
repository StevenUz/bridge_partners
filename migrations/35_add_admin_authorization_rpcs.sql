-- Migration: 35_add_admin_authorization_rpcs
-- Purpose: Add admin-only authorization RPCs and expose profile role in session profile upsert

DROP FUNCTION IF EXISTS public.upsert_current_profile(text, text);

CREATE OR REPLACE FUNCTION public.upsert_current_profile(
  p_username text DEFAULT NULL,
  p_display_name text DEFAULT NULL
)
RETURNS TABLE(profile_id uuid, username text, display_name text, email text, role profile_role)
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
  SELECT p.id, p.username, p.display_name, p.email, p.role
  FROM public.profiles p
  WHERE p.id = v_profile_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_current_profile(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.authorize_player(
  p_target_profile_id uuid
)
RETURNS TABLE(profile_id uuid, username text, role profile_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller_role profile_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.role
  INTO v_caller_role
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_caller_role IS DISTINCT FROM 'admin'::profile_role THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  UPDATE public.profiles p
  SET role = 'authorized'::profile_role,
      updated_at = now()
  WHERE p.id = p_target_profile_id
    AND p.role <> 'admin'::profile_role;

  RETURN QUERY
  SELECT p.id, p.username, p.role
  FROM public.profiles p
  WHERE p.id = p_target_profile_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.authorize_player(uuid) TO authenticated;
