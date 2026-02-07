-- Migration: 20_create_lobby_tables
-- Purpose: Add minimal lobby tables for rooms, seats, and members (for sync)

-- ================================
-- Custom types (safe if already exist)
-- ================================
DO $$ BEGIN
  CREATE TYPE seat_position AS ENUM ('north', 'south', 'east', 'west');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('player', 'spectator');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ================================
-- Rooms (tables)
-- ================================
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text DEFAULT 'waiting',
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- ================================
-- Room members (players/spectators)
-- ================================
CREATE TABLE IF NOT EXISTS room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  profile_id uuid,
  role member_role NOT NULL DEFAULT 'player',
  joined_at timestamptz DEFAULT now(),
  UNIQUE (room_id, profile_id, role)
);

CREATE INDEX IF NOT EXISTS room_members_room_id_idx ON room_members(room_id);
CREATE INDEX IF NOT EXISTS room_members_profile_id_idx ON room_members(profile_id);

-- ================================
-- Room seats (N/S/E/W)
-- ================================
CREATE TABLE IF NOT EXISTS room_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  seat_position seat_position NOT NULL,
  profile_id uuid,
  seated_at timestamptz,
  UNIQUE (room_id, seat_position)
);

CREATE INDEX IF NOT EXISTS room_seats_room_id_idx ON room_seats(room_id);
CREATE INDEX IF NOT EXISTS room_seats_profile_id_idx ON room_seats(profile_id);

-- ================================
-- Basic RLS (open for dev/testing)
-- ================================
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_seats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "rooms_read_write" ON rooms
    FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "room_members_read_write" ON room_members
    FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "room_seats_read_write" ON room_seats
    FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE rooms IS 'Lobby rooms (game tables)';
COMMENT ON TABLE room_members IS 'Room members (players/spectators)';
COMMENT ON TABLE room_seats IS 'Seat assignments for rooms';
