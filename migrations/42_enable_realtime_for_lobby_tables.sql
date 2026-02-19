-- Migration: 42_enable_realtime_for_lobby_tables
-- Purpose: Ensure lobby seat/member changes broadcast in realtime

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_seats;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
