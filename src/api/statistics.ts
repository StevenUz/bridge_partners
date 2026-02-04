/**
 * Statistics API Client
 * 
 * Functions for retrieving and displaying player statistics
 */

import { supabaseClient } from '../supabase';

// ============================================================================
// Types
// ============================================================================

export interface PlayerStatistics {
  player_id: string;
  display_name: string;
  boards_played: number;
  boards_completed: number;
  boards_as_declarer: number;
  boards_as_dummy: number;
  boards_as_defender: number;
  contracts_made: number;
  contracts_made_with_overtricks: number;
  contracts_failed: number;
  contracts_defeated: number;
  total_score: number;
  small_slams_bid: number;
  grand_slams_bid: number;
  success_rate_as_declarer: number;
  defense_success_rate: number;
}

export interface Partnership {
  partner_id: string;
  partner_name: string;
  boards_together: number;
  wins_together: number;
  win_rate: number;
}

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  display_name: string;
  boards_completed: number;
  total_score: number;
  success_rate: number;
  small_slams: number;
  grand_slams: number;
}

export interface BestPartnership {
  rank: number;
  player1_id: string;
  player1_name: string;
  player2_id: string;
  player2_name: string;
  boards_together: number;
  wins_together: number;
  win_rate: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get detailed statistics for a specific player
 */
export async function getPlayerStatistics(playerId: string): Promise<PlayerStatistics | null> {
  const { data, error } = await supabaseClient.rpc('get_player_statistics', {
    p_player_id: playerId
  });

  if (error) {
    console.error('Error fetching player statistics:', error);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Get all partnerships for a specific player
 */
export async function getPlayerPartnerships(playerId: string): Promise<Partnership[]> {
  const { data, error } = await supabaseClient.rpc('get_player_partnerships', {
    p_player_id: playerId
  });

  if (error) {
    console.error('Error fetching partnerships:', error);
    return [];
  }

  return data || [];
}

/**
 * Get leaderboard (top players by score)
 */
export async function getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabaseClient.rpc('get_leaderboard', {
    p_limit: limit
  });

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }

  return data || [];
}

/**
 * Get best partnerships (by win rate)
 */
export async function getBestPartnerships(
  minBoards: number = 5,
  limit: number = 10
): Promise<BestPartnership[]> {
  const { data, error } = await supabaseClient.rpc('get_best_partnerships', {
    p_min_boards: minBoards,
    p_limit: limit
  });

  if (error) {
    console.error('Error fetching best partnerships:', error);
    return [];
  }

  return data || [];
}

/**
 * Get current user's statistics
 */
export async function getMyStatistics(): Promise<PlayerStatistics | null> {
  const { data: { user } } = await supabaseClient.auth.getUser();
  
  if (!user) {
    console.error('User not authenticated');
    return null;
  }

  return getPlayerStatistics(user.id);
}

/**
 * Get current user's partnerships
 */
export async function getMyPartnerships(): Promise<Partnership[]> {
  const { data: { user } } = await supabaseClient.auth.getUser();
  
  if (!user) {
    console.error('User not authenticated');
    return [];
  }

  return getPlayerPartnerships(user.id);
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format score with + or - sign
 */
export function formatScore(score: number): string {
  if (score > 0) return `+${score}`;
  if (score < 0) return `${score}`;
  return '0';
}

/**
 * Format percentage with % sign
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Get color class for score (positive = green, negative = red)
 */
export function getScoreColorClass(score: number): string {
  if (score > 0) return 'text-green-600';
  if (score < 0) return 'text-red-600';
  return 'text-gray-600';
}

/**
 * Get color class for win rate
 */
export function getWinRateColorClass(rate: number): string {
  if (rate >= 60) return 'text-green-600';
  if (rate >= 50) return 'text-blue-600';
  if (rate >= 40) return 'text-yellow-600';
  return 'text-red-600';
}
