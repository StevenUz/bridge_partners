# Bridge Game Multi-Perspective System

## Overview

The application now implements a sophisticated multi-perspective table view system where each player (and observers) see the table from their own position, with all other positions rotated accordingly.

## Architecture

### Core Components

#### 1. **table-view.js** - Perspective Rotation Logic
Location: `src/pages/table/table-view.js`

Provides core functions for managing different table perspectives:

- **`getRotatedPositions(playerPosition)`**
  - Input: Player's actual seat position ('south', 'west', 'north', 'east')
  - Output: Object mapping display positions to physical positions
  - Example: If player is 'west', they see themselves at 'bottom', partner at 'top'
  - Mapping pattern:
    - **South player**: {bottom: 'south', left: 'west', top: 'north', right: 'east'}
    - **West player**: {bottom: 'west', left: 'north', top: 'east', right: 'south'}
    - **North player**: {bottom: 'north', left: 'east', top: 'south', right: 'west'}
    - **East player**: {bottom: 'east', left: 'south', top: 'west', right: 'north'}
    - **Observer**: {bottom: 'south', left: 'west', top: 'north', right: 'east'} (same as South player)

- **`createTableView(tableId, viewPosition, ctx)`**
  - Generates complete view data for a specific player
  - Parameters:
    - `tableId`: Which table (1-5)
    - `viewPosition`: 'south' | 'west' | 'north' | 'east' | 'observer'
    - `ctx`: Application context {language, t, navigate, etc.}
  - Returns: View data object with:
    - `tableId`: Current table ID
    - `viewPosition`: Actual player position
    - `positions`: Rotated position mapping
    - `visibleCards`: Card visibility per position
    - `partner`: Partner's actual position
    - `opponents`: Array of opponent positions

- **`getOppositePosition(position)`**
  - Returns partner position (opposite player at the table)
  - 'south' ↔ 'north'
  - 'west' ↔ 'east'

- **`getVisibleCards(tableId, position)`**
  - Placeholder for card visibility logic
  - Currently returns empty array (will populate with actual card data)

### 2. **table.js** - Table View Rendering
Location: `src/pages/table/table.js`

Main page renderer that:
- Reads URL parameters (`/table?id=1&position=south`)
- Gets player position from URL or defaults to 'observer'
- Uses `createTableView()` to generate perspective data
- Renders bridge-style grid with rotated positions
- Applies position-specific styling (current player highlighted)

**Key Features:**
- Position indicator showing current player's seat
- Rotated seat layout (4 positions in bridge arrangement)
- Card count display per seat
- Observer badge system
- Position switcher (dev/demo feature)

### 3. **URL Navigation**
Routes handle table selection with query parameters:
- `/table?id=1&position=south` - Player at South seat on Table 1
- `/table?id=2&position=west` - Player at West seat on Table 2
- `/table?id=3&position=observer` - Observer mode (sees South's perspective)

## Visual Layout

Each table displays in a bridge-style arrangement regardless of player position:

```
        Partner (North)
           
West                    East
(Opponent)          (Opponent)

         You (South)
       (Bottom position)
```

- **Current player** always appears at bottom with golden background and red border
- **Partner** appears directly opposite (top center)
- **Opponents** appear on left and right sides
- **Card counts** shown under each position

## Card Visibility Logic

### Current Implementation (Placeholder)
```javascript
getVisibleCards(tableId, position) {
  // Returns array of visible card objects for this position
  // Position-specific visibility:
  // - Current player: Full hand (13 cards)
  // - Dummy: Full hand visible (after dummy is revealed)
  // - Partner: Hidden (13 cards shown as count only)
  // - Opponents: Hidden (13 cards shown as count only)
  // - Observers: See all played cards, not hands
}
```

### Future Implementation Needs:
1. **Game State Tracking**
   - Deal phase: No cards visible except to dealer
   - Bidding phase: Bidder's hand visible, others hidden
   - Play phase: Dummy hand revealed, played cards visible
   - Results phase: All hands visible

2. **Position-Specific Rules**
   - **South player view**: Sees own cards (13), partner hidden (13), opponents hidden
   - **West player view**: Sees own cards (13), opponents/partner hidden
   - **North player view**: Sees own cards (13), partner hidden (South)
   - **East player view**: Sees own cards (13), opponents/partner hidden
   - **Observer view**: Same as South player view

3. **Card Data Structure**
   ```javascript
   {
     position: 'south',
     cards: [
       {suit: 'hearts', rank: 'A', id: 'h-a'},
       {suit: 'diamonds', rank: 'K', id: 'd-k'},
       // ... more cards
     ]
   }
   ```

## Sample Table Data

```javascript
const currentTable = {
  id: 1,
  players: {
    south: 'Elena',
    west: 'Marco',
    north: 'Ivan',
    east: 'Maria'
  },
  observers: ['Peter', 'Maya']
};
```

## Navigation from Lobby

When user joins a table from the lobby:
```javascript
ctx.navigate(`/table?id=${tableId}&position=south`);
```

For other positions (future enhancement):
```javascript
ctx.navigate(`/table?id=${tableId}&position=west`);
ctx.navigate(`/table?id=${tableId}&position=north`);
ctx.navigate(`/table?id=${tableId}&position=east`);
ctx.navigate(`/table?id=${tableId}&position=observer`);
```

## Internationalization

Translation keys for seat positions support both languages:
- **English**: `seatSouth`, `seatWest`, `seatNorth`, `seatEast`
- **Bulgarian**: `сеSouth` → "Юг", `seatWest` → "Запад", etc.

Position indicator uses `data-i18n` attributes for automatic translation:
```html
<span data-i18n="yourPosition"></span>: 
<strong data-i18n="seatWest"></strong>
```

## Testing Different Perspectives

The current implementation includes a **position switcher** (demo feature) allowing quick testing of different views:

- Buttons for South, West, North, East, Observer
- Clicking switches the perspective instantly
- View rotates to show that player's position
- Used for development and demonstration

## Performance Considerations

### Current Approach
- Single `createTableView()` call generates all necessary data
- No need to create 25 separate files (5 tables × 5 positions)
- Dynamic rendering based on URL parameters
- Memory efficient: Only renders current view

### Potential Optimization
If app grows to many concurrent tables:
- Cache position mappings (computed once)
- Lazy-load card data
- Use virtual scrolling for observer list

## Future Enhancements

1. **Card Rendering**
   - SVG card graphics for each suit/rank
   - Animated card dealing
   - Drag-and-drop card play

2. **Game Flow**
   - Bidding system
   - Trick taking visualization
   - Score calculation

3. **Multiple Tables**
   - Minimize/collapse table views
   - Switch between tables quickly
   - Watch multiple games simultaneously

4. **Responsive Design**
   - Mobile-friendly card layout
   - Touch gestures for card play
   - Tablet-optimized UI

## Code Examples

### Switching Positions (Dev Mode)
```javascript
const tableId = new URLSearchParams(window.location.search).get('id') || '1';
ctx.navigate(`/table?id=${tableId}&position=west`);
```

### Checking Player's Partner
```javascript
const viewData = createTableView(1, 'south', ctx);
console.log(viewData.partner); // 'north'
```

### Getting Opponent Positions
```javascript
const opponents = viewData.opponents; // ['west', 'east']
```

## Related Files

- `src/pages/table/table.js` - Main render function
- `src/pages/table/table.css` - Layout and styling
- `src/pages/table/table-view.js` - Perspective logic
- `src/pages/table/table.html` - HTML template
- `src/pages/lobby/lobby.js` - Table selection navigation
- `src/i18n/i18n.js` - Translation keys

## Summary

The multi-perspective system provides:
- ✅ Each player sees themselves at bottom
- ✅ Correct position rotations for all 4 players + observer
- ✅ Scalable design for up to 5 tables
- ✅ URL-based perspective switching
- ✅ Bilingual support (EN/BG)
- ✅ Foundation for card visibility logic
- ✅ Demo mode for testing different views

The architecture is maintainable, scalable, and ready for integration with game logic and real-time updates.
