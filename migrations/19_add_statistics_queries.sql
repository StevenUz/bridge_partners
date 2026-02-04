-- Migration: 19_add_statistics_queries
-- Purpose: Add helper functions for retrieving player statistics
-- Status: NEW - adds query functions for statistics views

-- ============================================================================
-- FUNCTION: get_player_statistics
-- ============================================================================
-- Get detailed statistics for a specific player

CREATE OR REPLACE FUNCTION get_player_statistics(p_player_id uuid)
RETURNS TABLE (
    player_id uuid,
    display_name text,
    boards_played int,
    boards_completed int,
    boards_as_declarer int,
    boards_as_dummy int,
    boards_as_defender int,
    contracts_made int,
    contracts_made_with_overtricks int,
    contracts_failed int,
    contracts_defeated int,
    total_score int,
    small_slams_bid int,
    grand_slams_bid int,
    success_rate_as_declarer numeric,
    defense_success_rate numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ps.player_id,
        p.display_name,
        ps.boards_played,
        ps.boards_completed,
        ps.boards_as_declarer,
        ps.boards_as_dummy,
        ps.boards_as_defender,
        ps.contracts_made,
        ps.contracts_made_with_overtricks,
        ps.contracts_failed,
        ps.contracts_defeated,
        ps.total_score,
        ps.small_slams_bid,
        ps.grand_slams_bid,
        -- Success rate as declarer (made contracts / total as declarer)
        CASE 
            WHEN (ps.boards_as_declarer + ps.boards_as_dummy) > 0 
            THEN ROUND((ps.contracts_made + ps.contracts_made_with_overtricks)::numeric / 
                      (ps.boards_as_declarer + ps.boards_as_dummy)::numeric * 100, 2)
            ELSE 0
        END as success_rate_as_declarer,
        -- Defense success rate (defeated contracts / total as defender)
        CASE 
            WHEN ps.boards_as_defender > 0 
            THEN ROUND(ps.contracts_defeated::numeric / ps.boards_as_defender::numeric * 100, 2)
            ELSE 0
        END as defense_success_rate
    FROM player_statistics ps
    JOIN profiles p ON p.id = ps.player_id
    WHERE ps.player_id = p_player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- FUNCTION: get_player_partnerships
-- ============================================================================
-- Get all partnerships for a specific player

CREATE OR REPLACE FUNCTION get_player_partnerships(p_player_id uuid)
RETURNS TABLE (
    partner_id uuid,
    partner_name text,
    boards_together int,
    wins_together int,
    win_rate numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN pt.player_id = p_player_id THEN pt.partner_id
            ELSE pt.player_id
        END as partner_id,
        p.display_name as partner_name,
        pt.boards_together,
        pt.wins_together,
        ROUND(pt.wins_together::numeric / NULLIF(pt.boards_together, 0)::numeric * 100, 2) as win_rate
    FROM partnerships pt
    JOIN profiles p ON (
        CASE 
            WHEN pt.player_id = p_player_id THEN p.id = pt.partner_id
            ELSE p.id = pt.player_id
        END
    )
    WHERE pt.player_id = p_player_id OR pt.partner_id = p_player_id
    ORDER BY pt.boards_together DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- FUNCTION: get_leaderboard
-- ============================================================================
-- Get top players by total score

CREATE OR REPLACE FUNCTION get_leaderboard(p_limit int DEFAULT 10)
RETURNS TABLE (
    rank bigint,
    player_id uuid,
    display_name text,
    boards_completed int,
    total_score int,
    success_rate numeric,
    small_slams int,
    grand_slams int
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY ps.total_score DESC) as rank,
        ps.player_id,
        p.display_name,
        ps.boards_completed,
        ps.total_score,
        CASE 
            WHEN (ps.boards_as_declarer + ps.boards_as_dummy) > 0 
            THEN ROUND((ps.contracts_made + ps.contracts_made_with_overtricks)::numeric / 
                      (ps.boards_as_declarer + ps.boards_as_dummy)::numeric * 100, 2)
            ELSE 0
        END as success_rate,
        ps.small_slams_bid as small_slams,
        ps.grand_slams_bid as grand_slams
    FROM player_statistics ps
    JOIN profiles p ON p.id = ps.player_id
    WHERE ps.boards_completed > 0
    ORDER BY ps.total_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- FUNCTION: get_best_partnerships
-- ============================================================================
-- Get top partnerships by win rate (min 5 boards together)

CREATE OR REPLACE FUNCTION get_best_partnerships(p_min_boards int DEFAULT 5, p_limit int DEFAULT 10)
RETURNS TABLE (
    rank bigint,
    player1_id uuid,
    player1_name text,
    player2_id uuid,
    player2_name text,
    boards_together int,
    wins_together int,
    win_rate numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY 
            ROUND(pt.wins_together::numeric / pt.boards_together::numeric * 100, 2) DESC,
            pt.boards_together DESC
        ) as rank,
        pt.player_id as player1_id,
        p1.display_name as player1_name,
        pt.partner_id as player2_id,
        p2.display_name as player2_name,
        pt.boards_together,
        pt.wins_together,
        ROUND(pt.wins_together::numeric / pt.boards_together::numeric * 100, 2) as win_rate
    FROM partnerships pt
    JOIN profiles p1 ON p1.id = pt.player_id
    JOIN profiles p2 ON p2.id = pt.partner_id
    WHERE pt.boards_together >= p_min_boards
    ORDER BY win_rate DESC, pt.boards_together DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Add comments
COMMENT ON FUNCTION get_player_statistics IS 'Get detailed statistics for a specific player';
COMMENT ON FUNCTION get_player_partnerships IS 'Get all partnerships for a specific player';
COMMENT ON FUNCTION get_leaderboard IS 'Get top players by total score';
COMMENT ON FUNCTION get_best_partnerships IS 'Get top partnerships by win rate';
