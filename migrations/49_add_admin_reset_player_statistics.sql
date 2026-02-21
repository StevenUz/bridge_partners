-- Migration 49: Admin reset player statistics
CREATE OR REPLACE FUNCTION public.admin_reset_player_statistics(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role public.profile_role;
BEGIN
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE auth_user_id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'admin'::public.profile_role THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  UPDATE player_statistics
  SET
    boards_played                  = 0,
    boards_completed               = 0,
    boards_as_declarer             = 0,
    boards_as_dummy                = 0,
    boards_as_defender             = 0,
    contracts_made                 = 0,
    contracts_made_with_overtricks = 0,
    contracts_failed               = 0,
    contracts_defeated             = 0,
    total_score                    = 0,
    small_slams_bid                = 0,
    grand_slams_bid                = 0,
    updated_at                     = now()
  WHERE player_id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_player_statistics TO authenticated;
