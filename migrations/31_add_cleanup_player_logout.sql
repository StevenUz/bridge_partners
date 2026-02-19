-- Migration: 31_add_cleanup_player_logout
-- Purpose: Remove player from all tables, seats, and observer roles on logout

CREATE OR REPLACE FUNCTION public.cleanup_player_logout(
  p_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM public.room_seats
  WHERE profile_id = p_profile_id;

  DELETE FROM public.room_members
  WHERE profile_id = p_profile_id;
END;
$function$;
