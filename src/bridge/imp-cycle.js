/**
 * IMP Cycle Management Module
 * Handles storage, retrieval and continuation of IMP cycles
 */

/**
 * Check if there's an existing IMP cycle for the current players
 * @param {Object} supabase - Supabase client
 * @param {Object} players - { north, south, east, west } player names
 * @returns {Promise<Object|null>} - Existing cycle data or null
 */
export async function findExistingCycle(supabase, players) {
  if (!supabase || !players) return null;

  const { data, error } = await supabase
    .rpc('find_matching_imp_cycle', {
      p_north: players.north,
      p_south: players.south,
      p_east: players.east,
      p_west: players.west
    });

  if (error) {
    console.error('Error finding existing cycle:', error);
    return null;
  }

  return data || null;
}

/**
 * Create a new IMP cycle
 * @param {Object} supabase - Supabase client
 * @param {Object} players - { north, south, east, west } player names
 * @param {number} roomId - Current room ID
 * @returns {Promise<Object|null>} - New cycle data or null
 */
export async function createNewCycle(supabase, players, roomId) {
  if (!supabase || !players) return null;

  const { data, error } = await supabase
    .from('imp_cycles')
    .insert({
      player_north: players.north,
      player_south: players.south,
      player_east: players.east,
      player_west: players.west,
      cycle_number: 1,
      current_game: 1,
      table_data: {},
      last_room_id: roomId,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating new cycle:', error);
    return null;
  }

  return data;
}

/**
 * Update IMP cycle after a deal completes
 * @param {Object} supabase - Supabase client
 * @param {string} cycleId - Cycle UUID
 * @param {number} impForNS - IMP points from NS perspective
 * @param {number} currentGame - Current game number (1-16)
 * @param {Object} tableData - Current table data
 * @returns {Promise<boolean>} - Success status
 */
export async function updateCycleAfterDeal(supabase, cycleId, impForNS, currentGame, tableData) {
  if (!supabase || !cycleId) return false;

  // Calculate next game number
  let nextGame = currentGame + 1;
  let cycleNumber = 1;
  let isCompleted = false;

  // If we've completed 16 games, start a new cycle
  if (nextGame > 16) {
    nextGame = 1;
    cycleNumber = cycleNumber + 1;
    isCompleted = true;
  }

  const updateData = {
    current_game: nextGame,
    table_data: tableData,
    updated_at: new Date().toISOString()
  };

  if (isCompleted) {
    updateData.cycle_number = cycleNumber;
    // Mark current cycle as completed and create a new one
    updateData.is_active = false;
    updateData.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('imp_cycles')
    .update(updateData)
    .eq('id', cycleId);

  if (error) {
    console.error('Error updating cycle:', error);
    return false;
  }

  return true;
}

/**
 * Deactivate cycle when a player leaves
 * @param {Object} supabase - Supabase client
 * @param {string} cycleId - Cycle UUID
 * @returns {Promise<boolean>} - Success status
 */
export async function deactivateCycle(supabase, cycleId) {
  if (!supabase || !cycleId) return false;

  const { error } = await supabase
    .from('imp_cycles')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', cycleId);

  if (error) {
    console.error('Error deactivating cycle:', error);
    return false;
  }

  return true;
}

/**
 * Load cycle data from database
 * @param {Object} supabase - Supabase client
 * @param {string} cycleId - Cycle UUID
 * @returns {Promise<Object|null>} - Cycle data or null
 */
export async function loadCycle(supabase, cycleId) {
  if (!supabase || !cycleId) return null;

  const { data, error } = await supabase
    .from('imp_cycles')
    .select('*')
    .eq('id', cycleId)
    .single();

  if (error) {
    console.error('Error loading cycle:', error);
    return null;
  }

  return data;
}

/**
 * Convert database cycle to local storage format
 * @param {Object} dbCycle - Cycle data from database
 * @returns {Object} - Local storage format
 */
export function dbCycleToLocal(dbCycle) {
  if (!dbCycle) return null;

  return {
    // RPC returns 'id'; older RPC version returned 'cycle_id' – handle both
    cycleId: dbCycle.id || dbCycle.cycle_id || null,
    cycleNumber: dbCycle.cycle_number,
    currentGame: dbCycle.current_game,
    table: dbCycle.table_data || {}
  };
}

/**
 * Get current players from room
 * @param {Object} room - Current room/table object
 * @returns {Object|null} - { north, south, east, west } or null
 */
export function getCurrentPlayers(room) {
  if (!room || !room.players) return null;

  const { north, south, east, west } = room.players;
  
  // All seats must be filled
  if (!north || !south || !east || !west) return null;

  return { north, south, east, west };
}
