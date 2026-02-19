-- Migration: 28_hash_passwords_and_authenticate_player
-- Purpose: Store passwords as bcrypt hashes and authenticate via DB function

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE public.profiles
SET password = crypt(password, gen_salt('bf'))
WHERE password IS NOT NULL
  AND password <> ''
  AND password NOT LIKE '$2%';

CREATE OR REPLACE FUNCTION public.register_player(
  p_username text,
  p_email text,
  p_display_name text DEFAULT NULL::text,
  p_password text DEFAULT NULL::text
)
RETURNS TABLE(user_id uuid, username text, email text, display_name text, already_exists boolean)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_username_exists BOOLEAN;
  v_email_exists BOOLEAN;
  v_user_id UUID;
BEGIN
  SELECT * FROM check_player_exists(p_username, p_email)
  INTO v_username_exists, v_email_exists;

  IF v_username_exists OR v_email_exists THEN
    RETURN QUERY SELECT NULL::UUID, p_username, p_email, NULL::TEXT, TRUE;
    RETURN;
  END IF;

  IF p_password IS NULL OR btrim(p_password) = '' THEN
    RAISE EXCEPTION 'Password is required';
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO profiles (id, username, email, display_name, password)
  VALUES (
    v_user_id,
    p_username,
    p_email,
    p_display_name,
    crypt(p_password, gen_salt('bf'))
  );

  INSERT INTO player_statistics (player_id)
  VALUES (v_user_id)
  ON CONFLICT (player_id) DO NOTHING;

  RETURN QUERY SELECT v_user_id, p_username, p_email, p_display_name, FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.authenticate_player(
  p_username text,
  p_password text
)
RETURNS TABLE(user_id uuid, username text, display_name text, authenticated boolean)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, TRUE
  FROM public.profiles p
  WHERE lower(p.username) = lower(p_username)
    AND p.password IS NOT NULL
    AND p.password = crypt(p_password, p.password)
  LIMIT 1;
END;
$function$;