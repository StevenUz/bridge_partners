// Table view logic - handles rendering of cards based on player position
// Each player sees themselves at the bottom (South position visually)
// but displays their actual position name

export function getRotatedPositions(playerPosition) {
  // Map showing which physical seat sees which logical position
  const rotations = {
    south: { bottom: 'south', left: 'west', top: 'north', right: 'east' },
    west: { bottom: 'west', left: 'north', top: 'east', right: 'south' },
    north: { bottom: 'north', left: 'east', top: 'south', right: 'west' },
    east: { bottom: 'east', left: 'south', top: 'north', right: 'west' }
  };
  
  return rotations[playerPosition] || rotations.south;
}

export function createTableView(tableId, viewPosition, ctx) {
  // viewPosition is the actual seat (south, west, north, east, observer)
  // observer always sees south's view
  const actualPosition = viewPosition === 'observer' ? 'south' : viewPosition;
  const positions = getRotatedPositions(actualPosition);
  
  return {
    tableId,
    viewPosition,
    actualPosition,
    positions,
    // Cards visible only to this player
    visibleCards: getVisibleCards(tableId, actualPosition),
    // Partner is opposite position
    partner: getOppositePosition(actualPosition),
    // Opponents are left and right
    opponents: [positions.left, positions.right]
  };
}

function getOppositePosition(position) {
  const opposites = {
    south: 'north',
    north: 'south',
    west: 'east',
    east: 'west'
  };
  return opposites[position];
}

function getVisibleCards(tableId, position) {
  // TODO: This will be replaced with actual card data from backend
  // For now, return empty array - cards will be added in later phases
  return {
    hand: [], // Player's cards
    dummy: [], // Partner's cards (visible after opening lead)
    played: [] // Cards on the table
  };
}
