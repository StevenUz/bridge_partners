-- Migration: 18_create_player_statistics
-- Purpose: Create statistics tables for player performance tracking
-- Status: NEW - adds player_statistics and partnerships tables

-- ============================================================================
-- TABLE: player_statistics
-- ============================================================================
-- Aggregated statistics for each player across all completed boards

CREATE TABLE player_statistics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Game counts
    boards_played int DEFAULT 0 NOT NULL,
    boards_completed int DEFAULT 0 NOT NULL,
    
    -- Role-specific counts
    boards_as_declarer int DEFAULT 0 NOT NULL,
    boards_as_dummy int DEFAULT 0 NOT NULL,
    boards_as_defender int DEFAULT 0 NOT NULL,
    
    -- Contract results (as declarer/dummy)
    contracts_made int DEFAULT 0 NOT NULL,              -- Made exactly
    contracts_made_with_overtricks int DEFAULT 0 NOT NULL,  -- Made with overtricks
    contracts_failed int DEFAULT 0 NOT NULL,            -- Went down
    
    -- Defensive success
    contracts_defeated int DEFAULT 0 NOT NULL,          -- As defender, defeated opponents
    
    -- Scoring
    total_score int DEFAULT 0 NOT NULL,                 -- Cumulative IMP/score (can be negative)
    
    -- Slam bidding
    small_slams_bid int DEFAULT 0 NOT NULL,             -- 6-level contracts (both partners count)
    grand_slams_bid int DEFAULT 0 NOT NULL,             -- 7-level contracts (both partners count)
    
    -- Timestamps
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    
    UNIQUE(player_id)
);

CREATE INDEX idx_player_statistics_player ON player_statistics(player_id);
CREATE INDEX idx_player_statistics_boards_played ON player_statistics(boards_played DESC);
CREATE INDEX idx_player_statistics_total_score ON player_statistics(total_score DESC);

-- ============================================================================
-- TABLE: partnerships
-- ============================================================================
-- Track how many times each player has partnered with each other player

CREATE TABLE partnerships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    partner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    boards_together int DEFAULT 0 NOT NULL,
    wins_together int DEFAULT 0 NOT NULL,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    
    -- Ensure player_id < partner_id to avoid duplicates (A-B and B-A)
    CONSTRAINT partnerships_ordered CHECK (player_id < partner_id),
    UNIQUE(player_id, partner_id)
);

CREATE INDEX idx_partnerships_player ON partnerships(player_id);
CREATE INDEX idx_partnerships_partner ON partnerships(partner_id);
CREATE INDEX idx_partnerships_boards_together ON partnerships(boards_together DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE player_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnerships ENABLE ROW LEVEL SECURITY;

-- Anyone can view player statistics (for leaderboards, etc.)
CREATE POLICY "Anyone can view player statistics"
    ON player_statistics FOR SELECT
    USING (true);

-- Anyone can view partnerships
CREATE POLICY "Anyone can view partnerships"
    ON partnerships FOR SELECT
    USING (true);

-- Only system/RPC can write (no client writes)
-- (No INSERT/UPDATE/DELETE policies = write denied)

-- ============================================================================
-- FUNCTION: update_statistics_after_board
-- ============================================================================
-- Called after a board is completed to update player statistics

CREATE OR REPLACE FUNCTION update_statistics_after_board(p_board_id uuid)
RETURNS void AS $$
DECLARE
    v_board boards%ROWTYPE;
    v_result board_results%ROWTYPE;
    v_declarer_id uuid;
    v_dummy_id uuid;
    v_defender1_id uuid;
    v_defender2_id uuid;
    v_declarer_seat int;
    v_dummy_seat int;
    v_contract_made boolean;
    v_tricks_diff int;
    v_is_slam boolean;
    v_slam_level int;
BEGIN
    -- Get board info
    SELECT * INTO v_board FROM boards WHERE id = p_board_id;
    
    IF NOT FOUND OR v_board.status != 'completed' THEN
        RETURN;  -- Board not completed yet
    END IF;
    
    -- Get result
    SELECT * INTO v_result FROM board_results WHERE board_id = p_board_id;
    
    IF NOT FOUND THEN
        RETURN;  -- No result recorded
    END IF;
    
    -- Get player IDs from seats
    v_declarer_seat := v_board.declarer_seat;
    v_dummy_seat := (v_declarer_seat + 2) % 4;  -- Opposite of declarer
    
    SELECT profile_id INTO v_declarer_id 
    FROM room_seats rs
    JOIN matches m ON m.id = v_board.match_id
    WHERE rs.room_id = m.room_id AND rs.seat = v_declarer_seat;
    
    SELECT profile_id INTO v_dummy_id 
    FROM room_seats rs
    JOIN matches m ON m.id = v_board.match_id
    WHERE rs.room_id = m.room_id AND rs.seat = v_dummy_seat;
    
    -- Get defenders (LHO and RHO of declarer)
    SELECT profile_id INTO v_defender1_id 
    FROM room_seats rs
    JOIN matches m ON m.id = v_board.match_id
    WHERE rs.room_id = m.room_id AND rs.seat = (v_declarer_seat + 1) % 4;
    
    SELECT profile_id INTO v_defender2_id 
    FROM room_seats rs
    JOIN matches m ON m.id = v_board.match_id
    WHERE rs.room_id = m.room_id AND rs.seat = (v_declarer_seat + 3) % 4;
    
    -- Determine if contract was made
    v_contract_made := v_result.tricks_taken >= v_result.tricks_required;
    v_tricks_diff := v_result.tricks_taken - v_result.tricks_required;
    
    -- Check for slam
    v_slam_level := CAST(SUBSTRING(v_board.contract FROM 1 FOR 1) AS int);
    v_is_slam := v_slam_level >= 6;
    
    -- ========================================================================
    -- Update statistics for all 4 players
    -- ========================================================================
    
    -- Declarer
    IF v_declarer_id IS NOT NULL THEN
        INSERT INTO player_statistics (player_id, boards_played, boards_completed, boards_as_declarer)
        VALUES (v_declarer_id, 1, 1, 1)
        ON CONFLICT (player_id) DO UPDATE SET
            boards_played = player_statistics.boards_played + 1,
            boards_completed = player_statistics.boards_completed + 1,
            boards_as_declarer = player_statistics.boards_as_declarer + 1,
            contracts_made = player_statistics.contracts_made + (CASE WHEN v_contract_made AND v_tricks_diff = 0 THEN 1 ELSE 0 END),
            contracts_made_with_overtricks = player_statistics.contracts_made_with_overtricks + (CASE WHEN v_contract_made AND v_tricks_diff > 0 THEN 1 ELSE 0 END),
            contracts_failed = player_statistics.contracts_failed + (CASE WHEN NOT v_contract_made THEN 1 ELSE 0 END),
            small_slams_bid = player_statistics.small_slams_bid + (CASE WHEN v_slam_level = 6 THEN 1 ELSE 0 END),
            grand_slams_bid = player_statistics.grand_slams_bid + (CASE WHEN v_slam_level = 7 THEN 1 ELSE 0 END),
            total_score = player_statistics.total_score + v_result.score_ns,  -- Assuming declarer is NS
            updated_at = now();
    END IF;
    
    -- Dummy
    IF v_dummy_id IS NOT NULL THEN
        INSERT INTO player_statistics (player_id, boards_played, boards_completed, boards_as_dummy)
        VALUES (v_dummy_id, 1, 1, 1)
        ON CONFLICT (player_id) DO UPDATE SET
            boards_played = player_statistics.boards_played + 1,
            boards_completed = player_statistics.boards_completed + 1,
            boards_as_dummy = player_statistics.boards_as_dummy + 1,
            contracts_made = player_statistics.contracts_made + (CASE WHEN v_contract_made AND v_tricks_diff = 0 THEN 1 ELSE 0 END),
            contracts_made_with_overtricks = player_statistics.contracts_made_with_overtricks + (CASE WHEN v_contract_made AND v_tricks_diff > 0 THEN 1 ELSE 0 END),
            contracts_failed = player_statistics.contracts_failed + (CASE WHEN NOT v_contract_made THEN 1 ELSE 0 END),
            small_slams_bid = player_statistics.small_slams_bid + (CASE WHEN v_slam_level = 6 THEN 1 ELSE 0 END),
            grand_slams_bid = player_statistics.grand_slams_bid + (CASE WHEN v_slam_level = 7 THEN 1 ELSE 0 END),
            total_score = player_statistics.total_score + v_result.score_ns,
            updated_at = now();
    END IF;
    
    -- Defenders
    IF v_defender1_id IS NOT NULL THEN
        INSERT INTO player_statistics (player_id, boards_played, boards_completed, boards_as_defender)
        VALUES (v_defender1_id, 1, 1, 1)
        ON CONFLICT (player_id) DO UPDATE SET
            boards_played = player_statistics.boards_played + 1,
            boards_completed = player_statistics.boards_completed + 1,
            boards_as_defender = player_statistics.boards_as_defender + 1,
            contracts_defeated = player_statistics.contracts_defeated + (CASE WHEN NOT v_contract_made THEN 1 ELSE 0 END),
            total_score = player_statistics.total_score + v_result.score_ew,
            updated_at = now();
    END IF;
    
    IF v_defender2_id IS NOT NULL THEN
        INSERT INTO player_statistics (player_id, boards_played, boards_completed, boards_as_defender)
        VALUES (v_defender2_id, 1, 1, 1)
        ON CONFLICT (player_id) DO UPDATE SET
            boards_played = player_statistics.boards_played + 1,
            boards_completed = player_statistics.boards_completed + 1,
            boards_as_defender = player_statistics.boards_as_defender + 1,
            contracts_defeated = player_statistics.contracts_defeated + (CASE WHEN NOT v_contract_made THEN 1 ELSE 0 END),
            total_score = player_statistics.total_score + v_result.score_ew,
            updated_at = now();
    END IF;
    
    -- ========================================================================
    -- Update partnership stats (declarer + dummy)
    -- ========================================================================
    
    IF v_declarer_id IS NOT NULL AND v_dummy_id IS NOT NULL THEN
        -- Ensure ordered pair (smaller UUID first)
        IF v_declarer_id < v_dummy_id THEN
            INSERT INTO partnerships (player_id, partner_id, boards_together, wins_together)
            VALUES (v_declarer_id, v_dummy_id, 1, CASE WHEN v_contract_made THEN 1 ELSE 0 END)
            ON CONFLICT (player_id, partner_id) DO UPDATE SET
                boards_together = partnerships.boards_together + 1,
                wins_together = partnerships.wins_together + (CASE WHEN v_contract_made THEN 1 ELSE 0 END),
                updated_at = now();
        ELSE
            INSERT INTO partnerships (player_id, partner_id, boards_together, wins_together)
            VALUES (v_dummy_id, v_declarer_id, 1, CASE WHEN v_contract_made THEN 1 ELSE 0 END)
            ON CONFLICT (player_id, partner_id) DO UPDATE SET
                boards_together = partnerships.boards_together + 1,
                wins_together = partnerships.wins_together + (CASE WHEN v_contract_made THEN 1 ELSE 0 END),
                updated_at = now();
        END IF;
    END IF;
    
    -- Partnership for defenders (optional, could also track this)
    IF v_defender1_id IS NOT NULL AND v_defender2_id IS NOT NULL THEN
        IF v_defender1_id < v_defender2_id THEN
            INSERT INTO partnerships (player_id, partner_id, boards_together, wins_together)
            VALUES (v_defender1_id, v_defender2_id, 1, CASE WHEN NOT v_contract_made THEN 1 ELSE 0 END)
            ON CONFLICT (player_id, partner_id) DO UPDATE SET
                boards_together = partnerships.boards_together + 1,
                wins_together = partnerships.wins_together + (CASE WHEN NOT v_contract_made THEN 1 ELSE 0 END),
                updated_at = now();
        ELSE
            INSERT INTO partnerships (player_id, partner_id, boards_together, wins_together)
            VALUES (v_defender2_id, v_defender1_id, 1, CASE WHEN NOT v_contract_made THEN 1 ELSE 0 END)
            ON CONFLICT (player_id, partner_id) DO UPDATE SET
                boards_together = partnerships.boards_together + 1,
                wins_together = partnerships.wins_together + (CASE WHEN NOT v_contract_made THEN 1 ELSE 0 END),
                updated_at = now();
        END IF;
    END IF;
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- SEED DATA: Sample players with statistics
-- ============================================================================

-- Insert 6 sample players into profiles (if they don't exist)
INSERT INTO profiles (id, display_name, created_at)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Иван Петров', '2025-12-01 10:00:00'),
    ('22222222-2222-2222-2222-222222222222', 'Мария Георгиева', '2025-12-02 11:00:00'),
    ('33333333-3333-3333-3333-333333333333', 'Георги Димитров', '2025-12-03 12:00:00'),
    ('44444444-4444-4444-4444-444444444444', 'Елена Стоянова', '2025-12-04 13:00:00'),
    ('55555555-5555-5555-5555-555555555555', 'Николай Иванов', '2025-12-05 14:00:00'),
    ('66666666-6666-6666-6666-666666666666', 'Стефан Тодоров', '2025-12-06 15:00:00')
ON CONFLICT (id) DO NOTHING;

-- Insert sample statistics for each player
INSERT INTO player_statistics (
    player_id,
    boards_played,
    boards_completed,
    boards_as_declarer,
    boards_as_dummy,
    boards_as_defender,
    contracts_made,
    contracts_made_with_overtricks,
    contracts_failed,
    contracts_defeated,
    total_score,
    small_slams_bid,
    grand_slams_bid
) VALUES
    -- Иван Петров - силен играч, добри резултати
    ('11111111-1111-1111-1111-111111111111', 145, 145, 38, 35, 72, 22, 14, 2, 35, 2850, 4, 1),
    
    -- Мария Георгиева - много опитна, отлични резултати
    ('22222222-2222-2222-2222-222222222222', 198, 198, 52, 48, 98, 31, 19, 2, 48, 4120, 6, 2),
    
    -- Георги Димитров - среден играч
    ('33333333-3333-3333-3333-333333333333', 87, 87, 24, 21, 42, 14, 8, 2, 18, 1240, 2, 0),
    
    -- Елена Стоянова - начинаещ, все още се учи
    ('44444444-4444-4444-4444-444444444444', 42, 42, 10, 11, 21, 5, 3, 2, 8, -320, 0, 0),
    
    -- Николай Иванов - добър защитник
    ('55555555-5555-5555-5555-555555555555', 112, 112, 26, 29, 57, 15, 9, 2, 32, 1880, 3, 0),
    
    -- Стефан Тодоров - агресивен разиграващ, рискува
    ('66666666-6666-6666-6666-666666666666', 76, 76, 22, 18, 36, 11, 8, 3, 16, 980, 5, 1)
ON CONFLICT (player_id) DO NOTHING;

-- Insert sample partnerships
INSERT INTO partnerships (player_id, partner_id, boards_together, wins_together) VALUES
    -- Иван & Мария - отлична двойка
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 34, 26),
    
    -- Иван & Георги
    ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 18, 12),
    
    -- Мария & Николай - много добра комбинация
    ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 42, 34),
    
    -- Мария & Стефан
    ('22222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666', 25, 18),
    
    -- Георги & Елена
    ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 21, 11),
    
    -- Георги & Стефан
    ('33333333-3333-3333-3333-333333333333', '66666666-6666-6666-6666-666666666666', 15, 9),
    
    -- Елена & Николай - ментор и ученик
    ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', 19, 8),
    
    -- Николай & Стефан
    ('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', 12, 7),
    
    -- Иван & Елена - Иван помага на Елена
    ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 8, 4),
    
    -- Иван & Николай
    ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 14, 10)
ON CONFLICT (player_id, partner_id) DO NOTHING;

-- Add comment
COMMENT ON TABLE player_statistics IS 'Aggregated player performance statistics across all completed boards';
COMMENT ON TABLE partnerships IS 'Track partnership history between players';
COMMENT ON FUNCTION update_statistics_after_board IS 'Called after board completion to update player and partnership statistics';
