-- Migration 43: Fix REPLICA IDENTITY and RLS for reliable Realtime
-- Problem 1: room_seats and room_members have REPLICA IDENTITY DEFAULT (only PK logged)
--   → DELETE events cannot be properly filtered/forwarded by Supabase Realtime
-- Problem 2: "Room seats viewable by room members" SELECT policy uses is_room_member(),
--   which can prevent Realtime notifications reaching users not yet in that room
-- Problem 3: room_members is out of sync with room_seats (missing player entries)

-- Fix 1: Set REPLICA IDENTITY FULL so all column values are logged on every change
ALTER TABLE public.room_seats REPLICA IDENTITY FULL;
ALTER TABLE public.room_members REPLICA IDENTITY FULL;

-- Fix 2: Drop the overly-restrictive SELECT-only policies.
-- The broad 'room_seats_read_write' (ALL WITH TRUE) already covers SELECT.
-- The restrictive policy can cause Realtime to skip events for users not yet in room_members.
DROP POLICY IF EXISTS "Room seats viewable by room members" ON public.room_seats;
DROP POLICY IF EXISTS "Room members are viewable by room members" ON public.room_members;

-- Fix 3: Re-sync room_members for any profile already in room_seats
-- Ensures that players who have a seat are also present in room_members
INSERT INTO public.room_members (room_id, profile_id, role)
SELECT DISTINCT rs.room_id, rs.profile_id, 'player'::member_role
FROM public.room_seats rs
WHERE rs.profile_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.room_members rm
    WHERE rm.room_id = rs.room_id
      AND rm.profile_id = rs.profile_id
      AND rm.role = 'player'::member_role
  );
