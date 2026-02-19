-- Migration: 27_add_profiles_password_and_register_player
-- Purpose: Add password column to profiles and persist it during registration

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS password text;

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

  v_user_id := gen_random_uuid();

  INSERT INTO profiles (id, username, email, display_name, password)
  VALUES (v_user_id, p_username, p_email, p_display_name, p_password);

  INSERT INTO player_statistics (player_id)
  VALUES (v_user_id)
  ON CONFLICT (player_id) DO NOTHING;

  RETURN QUERY SELECT v_user_id, p_username, p_email, p_display_name, FALSE;
END;
$function$;