-- Migration: 37_add_legacy_login_bridge_function
-- Purpose: Allow secure legacy username/password verification with email retrieval for Auth migration bridge

CREATE OR REPLACE FUNCTION public.legacy_authenticate_player(
  p_username text,
  p_password text
)
RETURNS TABLE(
  user_id uuid,
  username text,
  display_name text,
  email text,
  authenticated boolean,
  has_auth_user boolean,
  role profile_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.email,
    TRUE,
    (p.auth_user_id IS NOT NULL) AS has_auth_user,
    p.role
  FROM public.profiles p
  WHERE lower(p.username) = lower(p_username)
    AND p.password IS NOT NULL
    AND p.password = crypt(p_password, p.password)
  LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.legacy_authenticate_player(text, text) TO anon, authenticated;
