-- Migration: 47_fix_admin_delete_player_self_contained
-- Replace the edge-function-only version with one callable by authenticated
-- clients that verifies the caller is admin internally and handles auth.users deletion.

CREATE OR REPLACE FUNCTION public.admin_delete_player(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role public.profile_role;
  v_auth_user_id uuid;
BEGIN
  -- Identify caller from Supabase Auth JWT
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve caller profile role
  SELECT p.role INTO v_caller_role
  FROM public.profiles p
  WHERE p.auth_user_id = v_caller_id;

  IF v_caller_role IS DISTINCT FROM 'admin'::public.profile_role THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  -- Prevent self-deletion
  IF (SELECT id FROM public.profiles WHERE auth_user_id = v_caller_id) = p_profile_id THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Get auth user id before we remove the profile
  SELECT auth_user_id INTO v_auth_user_id
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Remove active session and lobby presence
  PERFORM public.cleanup_player_logout(p_profile_id);

  -- Session tracking
  DELETE FROM public.player_sessions   WHERE profile_id  = p_profile_id;

  -- Statistics & partnerships
  DELETE FROM public.player_statistics WHERE player_id   = p_profile_id;
  DELETE FROM public.partnerships      WHERE player_id   = p_profile_id
                                          OR partner_id  = p_profile_id;

  -- Chat messages
  DELETE FROM public.chat_messages WHERE profile_id = p_profile_id;

  -- Private hands
  DELETE FROM public.hands_private WHERE owner_user_id = p_profile_id;

  -- Nullify authored game events & rooms (preserve history)
  UPDATE public.game_events SET created_by = NULL WHERE created_by = p_profile_id;
  UPDATE public.rooms        SET created_by = NULL WHERE created_by = p_profile_id;

  -- Delete the profile (cascades from auth.users side won't fire since we delete profile first)
  DELETE FROM public.profiles WHERE id = p_profile_id;

  -- Delete the Supabase Auth user (SECURITY DEFINER runs as postgres which has access to auth schema)
  IF v_auth_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth_user_id;
  END IF;
END;
$$;

-- Revoke from everyone, then grant to authenticated only
REVOKE ALL ON FUNCTION public.admin_delete_player(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_player(uuid) FROM service_role;
GRANT  EXECUTE ON FUNCTION public.admin_delete_player(uuid) TO authenticated;
