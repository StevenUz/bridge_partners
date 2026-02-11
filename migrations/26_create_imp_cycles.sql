-- Create table for IMP cycles tracking
CREATE TABLE IF NOT EXISTS imp_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_north VARCHAR(255) NOT NULL,
  player_south VARCHAR(255) NOT NULL,
  player_east VARCHAR(255) NOT NULL,
  player_west VARCHAR(255) NOT NULL,
  cycle_number INTEGER NOT NULL DEFAULT 1,
  current_game INTEGER NOT NULL DEFAULT 1,
  -- Store IMP table data as JSONB (16 cells: A1-D4)
  table_data JSONB NOT NULL DEFAULT '{}',
  last_room_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Index for finding cycles by player configuration
CREATE INDEX idx_imp_cycles_players ON imp_cycles(player_north, player_south, player_east, player_west);

-- Index for active cycles
CREATE INDEX idx_imp_cycles_active ON imp_cycles(is_active) WHERE is_active = true;

-- Index for last updated
CREATE INDEX idx_imp_cycles_updated ON imp_cycles(updated_at DESC);

-- Function to find matching cycle for 4 players
CREATE OR REPLACE FUNCTION find_matching_imp_cycle(
  p_north VARCHAR(255),
  p_south VARCHAR(255),
  p_east VARCHAR(255),
  p_west VARCHAR(255)
)
RETURNS TABLE (
  cycle_id UUID,
  cycle_number INTEGER,
  current_game INTEGER,
  table_data JSONB,
  last_room_id INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ic.id,
    ic.cycle_number,
    ic.current_game,
    ic.table_data,
    ic.last_room_id,
    ic.updated_at
  FROM imp_cycles ic
  WHERE ic.player_north = p_north
    AND ic.player_south = p_south
    AND ic.player_east = p_east
    AND ic.player_west = p_west
    AND ic.is_active = true
  ORDER BY ic.updated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE imp_cycles ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active cycles
CREATE POLICY "Anyone can read active imp cycles"
  ON imp_cycles FOR SELECT
  USING (is_active = true);

-- Policy: Anyone can insert new cycles
CREATE POLICY "Anyone can insert imp cycles"
  ON imp_cycles FOR INSERT
  WITH CHECK (true);

-- Policy: Anyone can update cycles
CREATE POLICY "Anyone can update imp cycles"
  ON imp_cycles FOR UPDATE
  USING (true);
