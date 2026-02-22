-- Migration: 54_enable_realtime_for_rooms_deal_state
-- Purpose: Ensure updates to rooms (game_phase, deal_data, play fields) are
-- delivered to all connected clients via Supabase Realtime.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.rooms REPLICA IDENTITY FULL;
