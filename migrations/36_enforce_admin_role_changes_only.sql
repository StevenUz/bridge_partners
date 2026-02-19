-- Migration: 36_enforce_admin_role_changes_only
-- Purpose: Ensure only admins can change profile roles

CREATE OR REPLACE FUNCTION public.enforce_admin_role_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_caller_role public.profile_role;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT p.role
    INTO v_caller_role
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
    LIMIT 1;

    IF v_caller_role IS DISTINCT FROM 'admin'::public.profile_role THEN
      RAISE EXCEPTION 'Only admins can change user roles';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_admin_role_change ON public.profiles;
CREATE TRIGGER trg_enforce_admin_role_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_admin_role_change();
