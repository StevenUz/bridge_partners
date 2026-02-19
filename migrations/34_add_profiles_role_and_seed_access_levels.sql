-- Migration: 34_add_profiles_role_and_seed_access_levels
-- Purpose: Add profile roles (unauthorized, authorized, admin) and seed current users

DO $$
BEGIN
  CREATE TYPE public.profile_role AS ENUM ('unauthorized', 'authorized', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role public.profile_role NOT NULL DEFAULT 'unauthorized';

-- Set requested administrators
UPDATE public.profiles
SET role = 'admin'
WHERE lower(username) IN ('stevenuz', 'dodi');

-- Set all remaining current profiles as authorized
UPDATE public.profiles
SET role = 'authorized'
WHERE role <> 'admin';
