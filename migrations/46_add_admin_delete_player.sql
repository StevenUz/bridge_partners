-- Migration: 46_add_admin_delete_player
-- Purpose: SECURITY DEFINER RPC callable only by admin Edge Function (service role)
--          that purges ALL data for a given profile before the auth user is removed.

CREATE OR REPLACE FUNCTION public.admin_delete_player(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove active session and lobby presence
  PERFORM public.cleanup_player_logout(p_profile_id);

  -- Session tracking
  DELETE FROM public.player_sessions   WHERE profile_id = p_profile_id;

  -- Statistics & partnerships
  DELETE FROM public.player_statistics WHERE player_id  = p_profile_id;
  DELETE FROM public.partnerships      WHERE player_id  = p_profile_id
                                          OR partner_id = p_profile_id;

  -- Chat messages (hard-delete to honour the "remove all data" requirement)
  DELETE FROM public.chat_messages WHERE profile_id = p_profile_id;

  -- Private hands
  DELETE FROM public.hands_private WHERE owner_user_id = p_profile_id;

  -- Game events authored by this player (set to NULL to preserve game history)
  UPDATE public.game_events SET created_by = NULL WHERE created_by = p_profile_id;

  -- Rooms created by this player (keep room, clear ownership)
  UPDATE public.rooms SET created_by = NULL WHERE created_by = p_profile_id;

  -- Finally delete the profile itself; the CASCADE on profiles→auth.users
  -- ensures the auth user row is removed when called from the Edge Function
  -- via auth.admin.deleteUser(), but we delete the profile here explicitly
  -- so dependent rows are already gone before the cascade fires.
  DELETE FROM public.profiles WHERE id = p_profile_id;
END;
$$;

-- Only the service-role key (used by the Edge Function) may call this;
-- regular authenticated callers cannot invoke it.
REVOKE ALL ON FUNCTION public.admin_delete_player(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_player(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_delete_player(uuid) TO service_role;
