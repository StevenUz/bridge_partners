-- Migration: 52_add_is_ready_to_room_seats
-- Purpose: Add is_ready column to room_seats for reliable cross-device ready state sync

ALTER TABLE room_seats
  ADD COLUMN IF NOT EXISTS is_ready boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN room_seats.is_ready IS 'Player has signalled ready for the next deal';
