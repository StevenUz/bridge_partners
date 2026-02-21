-- Migration 48: Create record_deal_statistics RPC
-- Called from client (North player only) after each deal completes.
-- Updates player_statistics and partnerships directly from room seat data.

CREATE OR REPLACE FUNCTION public.record_deal_statistics(
  p_room_id       uuid,
  p_declarer_seat text,      -- 'N','S','E','W' or NULL for 4-pass boards
  p_contract_level int,      -- 1–7, or NULL for 4 passes
  p_contract_made  boolean,  -- true = made, false = failed, NULL = 4 passes
  p_overtricks     int,      -- ≥0 overtricks when made; 0 otherwise
  p_score_ns       int,      -- final NS score (may be negative)
  p_score_ew       int       -- final EW score (may be negative)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_north_id    uuid;
  v_south_id    uuid;
  v_east_id     uuid;
  v_west_id     uuid;

  v_declarer_id  uuid;
  v_dummy_id     uuid;
  v_defender1_id uuid;
  v_defender2_id uuid;

  v_declarer_score int;
  v_defender_score int;
  v_pid            uuid;
BEGIN
  -- ── Look up the four players sitting at the room ──────────────────────────
  SELECT profile_id INTO v_north_id FROM room_seats
    WHERE room_id = p_room_id AND seat_position = 'north' LIMIT 1;
  SELECT profile_id INTO v_south_id FROM room_seats
    WHERE room_id = p_room_id AND seat_position = 'south' LIMIT 1;
  SELECT profile_id INTO v_east_id  FROM room_seats
    WHERE room_id = p_room_id AND seat_position = 'east'  LIMIT 1;
  SELECT profile_id INTO v_west_id  FROM room_seats
    WHERE room_id = p_room_id AND seat_position = 'west'  LIMIT 1;

  -- ── 4-PASS BOARD (no contract) ─────────────────────────────────────────────
  IF p_declarer_seat IS NULL THEN
    FOREACH v_pid IN ARRAY ARRAY[v_north_id, v_south_id, v_east_id, v_west_id] LOOP
      CONTINUE WHEN v_pid IS NULL;
      INSERT INTO player_statistics (player_id, boards_played, boards_completed)
        VALUES (v_pid, 1, 1)
        ON CONFLICT (player_id) DO UPDATE SET
          boards_played    = player_statistics.boards_played    + 1,
          boards_completed = player_statistics.boards_completed + 1,
          updated_at       = now();
    END LOOP;
    RETURN;
  END IF;

  -- ── Assign roles based on declarer seat ───────────────────────────────────
  CASE p_declarer_seat
    WHEN 'N' THEN
      v_declarer_id  := v_north_id;
      v_dummy_id     := v_south_id;
      v_defender1_id := v_east_id;
      v_defender2_id := v_west_id;
    WHEN 'S' THEN
      v_declarer_id  := v_south_id;
      v_dummy_id     := v_north_id;
      v_defender1_id := v_east_id;
      v_defender2_id := v_west_id;
    WHEN 'E' THEN
      v_declarer_id  := v_east_id;
      v_dummy_id     := v_west_id;
      v_defender1_id := v_north_id;
      v_defender2_id := v_south_id;
    WHEN 'W' THEN
      v_declarer_id  := v_west_id;
      v_dummy_id     := v_east_id;
      v_defender1_id := v_north_id;
      v_defender2_id := v_south_id;
    ELSE RETURN;
  END CASE;

  -- Scores from each side's perspective
  v_declarer_score := CASE WHEN p_declarer_seat IN ('N','S') THEN p_score_ns ELSE p_score_ew END;
  v_defender_score := CASE WHEN p_declarer_seat IN ('N','S') THEN p_score_ew ELSE p_score_ns END;

  -- ── Declarer ──────────────────────────────────────────────────────────────
  IF v_declarer_id IS NOT NULL THEN
    INSERT INTO player_statistics (player_id, boards_played, boards_completed, boards_as_declarer)
      VALUES (v_declarer_id, 1, 1, 1)
      ON CONFLICT (player_id) DO UPDATE SET
        boards_played                 = player_statistics.boards_played                 + 1,
        boards_completed              = player_statistics.boards_completed              + 1,
        boards_as_declarer            = player_statistics.boards_as_declarer            + 1,
        contracts_made                = player_statistics.contracts_made
                                        + (CASE WHEN p_contract_made AND p_overtricks = 0 THEN 1 ELSE 0 END),
        contracts_made_with_overtricks= player_statistics.contracts_made_with_overtricks
                                        + (CASE WHEN p_contract_made AND p_overtricks > 0 THEN 1 ELSE 0 END),
        contracts_failed              = player_statistics.contracts_failed
                                        + (CASE WHEN NOT p_contract_made THEN 1 ELSE 0 END),
        small_slams_bid               = player_statistics.small_slams_bid
                                        + (CASE WHEN p_contract_level = 6 THEN 1 ELSE 0 END),
        grand_slams_bid               = player_statistics.grand_slams_bid
                                        + (CASE WHEN p_contract_level = 7 THEN 1 ELSE 0 END),
        total_score                   = player_statistics.total_score + v_declarer_score,
        updated_at                    = now();
  END IF;

  -- ── Dummy ─────────────────────────────────────────────────────────────────
  IF v_dummy_id IS NOT NULL THEN
    INSERT INTO player_statistics (player_id, boards_played, boards_completed, boards_as_dummy)
      VALUES (v_dummy_id, 1, 1, 1)
      ON CONFLICT (player_id) DO UPDATE SET
        boards_played                 = player_statistics.boards_played                 + 1,
        boards_completed              = player_statistics.boards_completed              + 1,
        boards_as_dummy               = player_statistics.boards_as_dummy               + 1,
        contracts_made                = player_statistics.contracts_made
                                        + (CASE WHEN p_contract_made AND p_overtricks = 0 THEN 1 ELSE 0 END),
        contracts_made_with_overtricks= player_statistics.contracts_made_with_overtricks
                                        + (CASE WHEN p_contract_made AND p_overtricks > 0 THEN 1 ELSE 0 END),
        contracts_failed              = player_statistics.contracts_failed
                                        + (CASE WHEN NOT p_contract_made THEN 1 ELSE 0 END),
        small_slams_bid               = player_statistics.small_slams_bid
                                        + (CASE WHEN p_contract_level = 6 THEN 1 ELSE 0 END),
        grand_slams_bid               = player_statistics.grand_slams_bid
                                        + (CASE WHEN p_contract_level = 7 THEN 1 ELSE 0 END),
        total_score                   = player_statistics.total_score + v_declarer_score,
        updated_at                    = now();
  END IF;

  -- ── Defender 1 ────────────────────────────────────────────────────────────
  IF v_defender1_id IS NOT NULL THEN
    INSERT INTO player_statistics (player_id, boards_played, boards_completed, boards_as_defender)
      VALUES (v_defender1_id, 1, 1, 1)
      ON CONFLICT (player_id) DO UPDATE SET
        boards_played       = player_statistics.boards_played       + 1,
        boards_completed    = player_statistics.boards_completed    + 1,
        boards_as_defender  = player_statistics.boards_as_defender  + 1,
        contracts_defeated  = player_statistics.contracts_defeated
                              + (CASE WHEN NOT p_contract_made THEN 1 ELSE 0 END),
        total_score         = player_statistics.total_score + v_defender_score,
        updated_at          = now();
  END IF;

  -- ── Defender 2 ────────────────────────────────────────────────────────────
  IF v_defender2_id IS NOT NULL THEN
    INSERT INTO player_statistics (player_id, boards_played, boards_completed, boards_as_defender)
      VALUES (v_defender2_id, 1, 1, 1)
      ON CONFLICT (player_id) DO UPDATE SET
        boards_played       = player_statistics.boards_played       + 1,
        boards_completed    = player_statistics.boards_completed    + 1,
        boards_as_defender  = player_statistics.boards_as_defender  + 1,
        contracts_defeated  = player_statistics.contracts_defeated
                              + (CASE WHEN NOT p_contract_made THEN 1 ELSE 0 END),
        total_score         = player_statistics.total_score + v_defender_score,
        updated_at          = now();
  END IF;

  -- ── Partnerships: Declarer + Dummy ────────────────────────────────────────
  IF v_declarer_id IS NOT NULL AND v_dummy_id IS NOT NULL THEN
    IF v_declarer_id < v_dummy_id THEN
      INSERT INTO partnerships (player_id, partner_id, boards_together, wins_together)
        VALUES (v_declarer_id, v_dummy_id, 1, CASE WHEN p_contract_made THEN 1 ELSE 0 END)
        ON CONFLICT (player_id, partner_id) DO UPDATE SET
          boards_together = partnerships.boards_together + 1,
          wins_together   = partnerships.wins_together + (CASE WHEN p_contract_made THEN 1 ELSE 0 END),
          updated_at      = now();
    ELSE
      INSERT INTO partnerships (player_id, partner_id, boards_together, wins_together)
        VALUES (v_dummy_id, v_declarer_id, 1, CASE WHEN p_contract_made THEN 1 ELSE 0 END)
        ON CONFLICT (player_id, partner_id) DO UPDATE SET
          boards_together = partnerships.boards_together + 1,
          wins_together   = partnerships.wins_together + (CASE WHEN p_contract_made THEN 1 ELSE 0 END),
          updated_at      = now();
    END IF;
  END IF;

  -- ── Partnerships: Defender 1 + Defender 2 ────────────────────────────────
  IF v_defender1_id IS NOT NULL AND v_defender2_id IS NOT NULL THEN
    IF v_defender1_id < v_defender2_id THEN
      INSERT INTO partnerships (player_id, partner_id, boards_together, wins_together)
        VALUES (v_defender1_id, v_defender2_id, 1, CASE WHEN NOT p_contract_made THEN 1 ELSE 0 END)
        ON CONFLICT (player_id, partner_id) DO UPDATE SET
          boards_together = partnerships.boards_together + 1,
          wins_together   = partnerships.wins_together + (CASE WHEN NOT p_contract_made THEN 1 ELSE 0 END),
          updated_at      = now();
    ELSE
      INSERT INTO partnerships (player_id, partner_id, boards_together, wins_together)
        VALUES (v_defender2_id, v_defender1_id, 1, CASE WHEN NOT p_contract_made THEN 1 ELSE 0 END)
        ON CONFLICT (player_id, partner_id) DO UPDATE SET
          boards_together = partnerships.boards_together + 1,
          wins_together   = partnerships.wins_together + (CASE WHEN NOT p_contract_made THEN 1 ELSE 0 END),
          updated_at      = now();
    END IF;
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION public.record_deal_statistics TO authenticated;
