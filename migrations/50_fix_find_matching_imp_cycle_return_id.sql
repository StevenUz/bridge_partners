-- Migration 50: Fix find_matching_imp_cycle to return 'id' (not 'cycle_id') so
-- dbCycleToLocal can read cycleId correctly and updateCycleAfterDeal gets called.

CREATE OR REPLACE FUNCTION public.find_matching_imp_cycle(
  p_north varchar, p_south varchar, p_east varchar, p_west varchar
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'id',           ic.id,          -- was 'cycle_id' before – caused cycleId to be null client-side
    'cycle_number', ic.cycle_number,
    'current_game', ic.current_game,
    'table_data',   ic.table_data,
    'last_room_id', ic.last_room_id,
    'updated_at',   ic.updated_at
  ) INTO result
  FROM imp_cycles ic
  WHERE ic.player_north = p_north
    AND ic.player_south = p_south
    AND ic.player_east  = p_east
    AND ic.player_west  = p_west
    AND ic.is_active = true
  ORDER BY ic.updated_at DESC
  LIMIT 1;

  RETURN result;
END;
$$;

-- Clean up duplicate (stale) imp_cycles for the same player combination:
-- keep only the most-recently updated one per group.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY player_north, player_south, player_east, player_west
           ORDER BY updated_at DESC
         ) AS rn
  FROM imp_cycles
  WHERE is_active = true
)
UPDATE imp_cycles
SET is_active = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
