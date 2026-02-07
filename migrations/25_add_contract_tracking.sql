-- Migration: 25_add_contract_tracking
-- Purpose: Add columns to rooms table for tracking current contract and play state

-- ================================
-- Add contract tracking columns to rooms
-- ================================

-- Contract level (1-7)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS contract_level integer;

-- Contract strain (C, D, H, S, NT)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS contract_strain text;

-- Doubled status (None, Doubled, Redoubled)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS contract_doubled text DEFAULT 'None';

-- Declarer seat (N, E, S, W)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS declarer_seat text;

-- Dummy seat (N, E, S, W)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS dummy_seat text;

-- Opening leader seat (N, E, S, W)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS opening_leader_seat text;

-- Current deal number (for vulnerability calculation)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS current_deal_number integer DEFAULT 1;

-- Play state flags
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS play_in_progress boolean DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS first_lead_played boolean DEFAULT false;

-- Trick counts
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS tricks_ns integer DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS tricks_ew integer DEFAULT 0;

-- Vulnerability for current deal (stored separately for clarity)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ns_vulnerable boolean DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ew_vulnerable boolean DEFAULT false;

-- Constraints
ALTER TABLE rooms ADD CONSTRAINT check_contract_level 
  CHECK (contract_level IS NULL OR (contract_level >= 1 AND contract_level <= 7));

ALTER TABLE rooms ADD CONSTRAINT check_contract_strain 
  CHECK (contract_strain IS NULL OR contract_strain IN ('C', 'D', 'H', 'S', 'NT'));

ALTER TABLE rooms ADD CONSTRAINT check_contract_doubled 
  CHECK (contract_doubled IN ('None', 'Doubled', 'Redoubled'));

ALTER TABLE rooms ADD CONSTRAINT check_declarer_seat 
  CHECK (declarer_seat IS NULL OR declarer_seat IN ('N', 'E', 'S', 'W'));

ALTER TABLE rooms ADD CONSTRAINT check_dummy_seat 
  CHECK (dummy_seat IS NULL OR dummy_seat IN ('N', 'E', 'S', 'W'));

ALTER TABLE rooms ADD CONSTRAINT check_opening_leader_seat 
  CHECK (opening_leader_seat IS NULL OR opening_leader_seat IN ('N', 'E', 'S', 'W'));

ALTER TABLE rooms ADD CONSTRAINT check_tricks_ns 
  CHECK (tricks_ns >= 0 AND tricks_ns <= 13);

ALTER TABLE rooms ADD CONSTRAINT check_tricks_ew 
  CHECK (tricks_ew >= 0 AND tricks_ew <= 13);

-- Comments
COMMENT ON COLUMN rooms.contract_level IS 'Contract level (1-7)';
COMMENT ON COLUMN rooms.contract_strain IS 'Contract strain: C, D, H, S, NT';
COMMENT ON COLUMN rooms.contract_doubled IS 'Doubled status: None, Doubled, Redoubled';
COMMENT ON COLUMN rooms.declarer_seat IS 'Declarer seat: N, E, S, W';
COMMENT ON COLUMN rooms.dummy_seat IS 'Dummy seat: N, E, S, W';
COMMENT ON COLUMN rooms.opening_leader_seat IS 'Opening leader seat: N, E, S, W';
COMMENT ON COLUMN rooms.current_deal_number IS 'Current deal number for vulnerability calculation';
COMMENT ON COLUMN rooms.play_in_progress IS 'Whether play phase is active';
COMMENT ON COLUMN rooms.first_lead_played IS 'Whether opening lead has been played';
COMMENT ON COLUMN rooms.tricks_ns IS 'Tricks won by North-South';
COMMENT ON COLUMN rooms.tricks_ew IS 'Tricks won by East-West';
COMMENT ON COLUMN rooms.ns_vulnerable IS 'North-South vulnerability for current deal';
COMMENT ON COLUMN rooms.ew_vulnerable IS 'East-West vulnerability for current deal';
