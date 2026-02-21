-- Migration 51: Partnership-based IMP cycle matching
--
-- Goal: cycles persist through interruptions and are identified by
-- canonical NS/EW partnership pairs regardless of N/S or E/W seat order.
-- Manual reset deletes ALL cycles for a partnership combo, not just one.

-- 1. Add canonical partnership columns ─────────────────────────────────────
ALTER TABLE imp_cycles
  ADD COLUMN IF NOT EXISTS ns_pair TEXT,
  ADD COLUMN IF NOT EXISTS ew_pair TEXT;

-- 2. Populate for existing rows ─────────────────────────────────────────────
UPDATE imp_cycles SET
  ns_pair = LEAST(player_north, player_south) || '|' || GREATEST(player_north, player_south),
  ew_pair = LEAST(player_east,  player_west)  || '|' || GREATEST(player_east,  player_west)
WHERE ns_pair IS NULL OR ew_pair IS NULL;

ALTER TABLE imp_cycles
  ALTER COLUMN ns_pair SET NOT NULL,
  ALTER COLUMN ew_pair SET NOT NULL;

-- 3. Index for fast partnership lookups ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_imp_cycles_partnership
  ON imp_cycles(ns_pair, ew_pair, is_active);

-- 4. Auto-populate on insert / update via trigger ───────────────────────────
CREATE OR REPLACE FUNCTION imp_cycles_set_pairs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.ns_pair := LEAST(NEW.player_north, NEW.player_south) || '|' || GREATEST(NEW.player_north, NEW.player_south);
  NEW.ew_pair := LEAST(NEW.player_east,  NEW.player_west)  || '|' || GREATEST(NEW.player_east,  NEW.player_west);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_imp_cycles_set_pairs ON imp_cycles;
CREATE TRIGGER trg_imp_cycles_set_pairs
  BEFORE INSERT OR UPDATE OF player_north, player_south, player_east, player_west
  ON imp_cycles
  FOR EACH ROW EXECUTE FUNCTION imp_cycles_set_pairs();

-- 5. Update find_matching_imp_cycle: partnership-based, not exact-seat ──────
CREATE OR REPLACE FUNCTION public.find_matching_imp_cycle(
  p_north varchar, p_south varchar, p_east varchar, p_west varchar
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_ns_pair text;
  v_ew_pair text;
  result    json;
BEGIN
  -- Canonical pairs: alphabetical sort so (A,B) == (B,A)
  v_ns_pair := LEAST(p_north, p_south) || '|' || GREATEST(p_north, p_south);
  v_ew_pair := LEAST(p_east,  p_west)  || '|' || GREATEST(p_east,  p_west);

  SELECT json_build_object(
    'id',           ic.id,
    'cycle_number', ic.cycle_number,
    'current_game', ic.current_game,
    'table_data',   ic.table_data,
    'last_room_id', ic.last_room_id,
    'updated_at',   ic.updated_at,
    'ns_pair',      ic.ns_pair,
    'ew_pair',      ic.ew_pair
  ) INTO result
  FROM imp_cycles ic
  WHERE ic.ns_pair  = v_ns_pair
    AND ic.ew_pair  = v_ew_pair
    AND ic.is_active = true
  ORDER BY ic.updated_at DESC
  LIMIT 1;

  RETURN result;
END;
$$;

-- 6. New RPC: delete ALL cycles for a partnership combo (manual reset) ──────
CREATE OR REPLACE FUNCTION public.reset_imp_cycles_for_partnership(
  p_north varchar, p_south varchar, p_east varchar, p_west varchar
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ns_pair text;
  v_ew_pair text;
BEGIN
  v_ns_pair := LEAST(p_north, p_south) || '|' || GREATEST(p_north, p_south);
  v_ew_pair := LEAST(p_east,  p_west)  || '|' || GREATEST(p_east,  p_west);

  DELETE FROM imp_cycles
  WHERE ns_pair = v_ns_pair
    AND ew_pair = v_ew_pair;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_imp_cycles_for_partnership TO authenticated;
