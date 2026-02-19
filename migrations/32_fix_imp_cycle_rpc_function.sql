-- Fix find_matching_imp_cycle function to properly work with Supabase RPC
-- The original function used RETURNS TABLE which causes type mismatch errors
-- This version returns JSON which RPC can handle correctly

DROP FUNCTION IF EXISTS find_matching_imp_cycle(VARCHAR, VARCHAR, VARCHAR, VARCHAR) CASCADE;

CREATE OR REPLACE FUNCTION find_matching_imp_cycle(
  p_north VARCHAR(255),
  p_south VARCHAR(255),
  p_east VARCHAR(255),
  p_west VARCHAR(255)
)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'cycle_id', ic.id,
    'cycle_number', ic.cycle_number,
    'current_game', ic.current_game,
    'table_data', ic.table_data,
    'last_room_id', ic.last_room_id,
    'updated_at', ic.updated_at
  ) INTO result
  FROM imp_cycles ic
  WHERE ic.player_north = p_north
    AND ic.player_south = p_south
    AND ic.player_east = p_east
    AND ic.player_west = p_west
    AND ic.is_active = true
  ORDER BY ic.updated_at DESC
  LIMIT 1;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions to anon and authenticated users
GRANT EXECUTE ON FUNCTION find_matching_imp_cycle(VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated;
