-- Migration: 53_add_deal_data_to_rooms
-- Purpose: Store active deal payload and game phase in rooms table.
-- This enables atomic cross-device deal distribution via postgres_changes,
-- eliminating the race condition between is_ready reset and deal broadcast.

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS game_phase text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS deal_data  jsonb;

COMMENT ON COLUMN rooms.game_phase IS 'Current phase: waiting | dealing | bidding | playing | results';
COMMENT ON COLUMN rooms.deal_data   IS 'Active deal payload (hands, hcpScores, dealNumber, etc.)';
