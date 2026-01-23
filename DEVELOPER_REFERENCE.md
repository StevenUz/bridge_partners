# Developer Quick Reference - Table Perspectives

## Quick Start

### View a Table from Different Positions
```javascript
// South player view
navigate('/table?id=1&position=south')

// West player view
navigate('/table?id=1&position=west')

// North player view
navigate('/table?id=1&position=north')

// East player view
navigate('/table?id=1&position=east')

// Observer view
navigate('/table?id=1&position=observer')
```

## Core Functions

### 1. getRotatedPositions()
```javascript
import { getRotatedPositions } from './table-view.js'

const rotated = getRotatedPositions('west')
// Returns:
// {
//   top: 'east',      // What's at top of screen
//   left: 'north',    // What's at left of screen
//   right: 'south',   // What's at right of screen
//   bottom: 'west'    // What's at bottom (you are here)
// }
```

**All Mappings:**
```
Position 'south'  → {top: 'north', left: 'west',  right: 'east',  bottom: 'south'}
Position 'west'   → {top: 'east',  left: 'north', right: 'south', bottom: 'west'}
Position 'north'  → {top: 'south', left: 'east',  right: 'west',  bottom: 'north'}
Position 'east'   → {top: 'west',  left: 'south', right: 'north', bottom: 'east'}
Position 'observer' → {top: 'north', left: 'west',  right: 'east',  bottom: 'south'} (= south)
```

### 2. createTableView()
```javascript
import { createTableView } from './table-view.js'

const viewData = createTableView(1, 'south', ctx)

// Returns:
// {
//   tableId: 1,
//   viewPosition: 'south',          // Actual position
//   positions: {                     // Display mapping
//     top: 'north',
//     left: 'west',
//     right: 'east',
//     bottom: 'south'
//   },
//   visibleCards: {
//     north: [],  // Empty array (not my cards)
//     west: [],
//     east: [],
//     south: []   // My cards (to be filled)
//   },
//   partner: 'north',               // Opposite player
//   opponents: ['west', 'east']     // Side players
// }
```

### 3. getOppositePosition()
```javascript
import { getOppositePosition } from './table-view.js'

getOppositePosition('south')  // 'north'
getOppositePosition('west')   // 'east'
getOppositePosition('north')  // 'south'
getOppositePosition('east')   // 'west'
```

### 4. getVisibleCards()
```javascript
import { getVisibleCards } from './table-view.js'

// Currently a placeholder, will return card arrays
const cards = getVisibleCards(1, 'south')
// Future: [{suit: 'hearts', rank: 'A'}, ...]
```

## Game Logic Integration

### Getting Player Information
```javascript
const table = {
  id: 1,
  players: {
    south: 'Elena',
    west: 'Marco',
    north: 'Ivan',
    east: 'Maria'
  },
  observers: ['Peter', 'Maya']
}

const viewData = createTableView(1, 'west', ctx)
const myName = table.players['west']           // 'Marco'
const partnerName = table.players['east']      // 'Ivan' (getOppositePosition('west') = 'east')
const opponents = ['south', 'north']           // Elena & Ivan (the side players)
```

### Card Visibility Rules (To Be Implemented)

**Current Player**
```javascript
// If you're South and it's the play phase:
visibleCards.south = myFullHand  // [13 card objects]
```

**Partner**
```javascript
// If you're South, your partner is North:
// Before dummy is revealed:
visibleCards.north = []  // Hidden

// After dummy is revealed:
visibleCards.north = partnerFullHand  // [13 card objects]
```

**Opponents**
```javascript
// Always hidden from view:
visibleCards.west = []
visibleCards.east = []
```

**Dummy Hand (After Reveal)**
```javascript
// Only visible to declaring side:
if (declarer.position === 'south' || declarer.position === 'north') {
  visibleCards.dummy = dummyFullHand
}
```

## HTML Rendering

### Template Structure
```html
<div class="position-indicator">
  <div class="alert alert-info">
    <i class="bi bi-person-circle"></i> 
    <span data-i18n="yourPosition"></span>: 
    <strong data-i18n="seat{Position}"></strong>
  </div>
</div>

<div class="bridge-table-layout-view">
  <!-- Dynamically generated seats -->
</div>

<div class="observers-section">
  <!-- Observer list -->
</div>
```

### Dynamic Seat Rendering
```javascript
const positions = viewData.positions
const seatDiv = document.createElement('div')
seatDiv.className = `seat-position ${direction}`
seatDiv.innerHTML = `
  <div class="seat-card ${player ? 'occupied' : ''} ${isCurrentPlayer ? 'current-player' : ''}">
    <i class="bi ${icon} seat-icon"></i>
    <div class="seat-label" data-i18n="seat${actualPos.charAt(0).toUpperCase() + actualPos.slice(1)}"></div>
    ${player ? `<div class="seat-player">${player}</div>` : '<div class="seat-empty" data-i18n="seatOpen"></div>'}
    <div class="card-count">${cardCount} <span data-i18n="cards"></span></div>
  </div>
`
```

## CSS Classes

### Layout Classes
```css
.bridge-table-layout-view      /* Main grid container */
.seat-position                  /* Individual seat wrapper */
.seat-position.north            /* Top position */
.seat-position.west             /* Left position */
.seat-position.east             /* Right position */
.seat-position.south            /* Bottom position */
```

### Card Classes
```css
.seat-card                      /* Seat card container */
.seat-card.occupied             /* Seat with player */
.seat-card.current-player       /* Highlighted current player */
.seat-icon                      /* Direction icon (↑↓←→) */
.seat-label                     /* Position name */
.seat-player                    /* Player name */
.seat-empty                     /* Empty seat label */
.card-count                     /* Card count display */
```

### State Classes
```css
.current-player                 /* Golden BG, red border, scaled */
.occupied                       /* Light green border */
.empty                          /* Gray styling */
```

## URL Parameter Handling

### Get Position from URL
```javascript
const params = new URLSearchParams(window.location.search)
const viewPosition = params.get('position') || 'observer'
const tableId = params.get('id') || '1'
```

### Create Navigation Link
```javascript
ctx.navigate(`/table?id=${tableId}&position=${newPosition}`)
```

### Valid Parameter Values
```
position: 'south' | 'west' | 'north' | 'east' | 'observer'
id: '1' | '2' | '3' | '4' | '5' (string, matches table IDs)
```

## Internationalization (i18n)

### Translation Keys Used
```javascript
'seatSouth'       // Position label
'seatWest'        // Position label
'seatNorth'       // Position label
'seatEast'        // Position label
'seatOpen'        // Empty seat text
'yourPosition'    // "Your Position:"
'observerMode'    // "Observer Mode"
'cards'           // "cards" (plural)
'tableObservers'  // "Observers"
'noObservers'     // "No observers"
```

### Apply Translations
```javascript
applyTranslations(container, language)
// Automatically updates all [data-i18n] attributes
```

## Testing Different Perspectives

### Manual Testing (Dev Mode)
1. Open `/table?id=1&position=south`
2. See South player view
3. Click "West" button → `/table?id=1&position=west`
4. View rotates to show West perspective
5. Repeat for North, East, Observer

### Browser Console Testing
```javascript
// Switch to West perspective programmatically
window.location.href = '/table?id=1&position=west'

// Or using navigate function in ctx:
ctx.navigate('/table?id=1&position=west')
```

## Common Patterns

### Check if Current Player is in Declaring Side
```javascript
const declarer = 'south'
const partner = 'north'
const viewPosition = 'west'

const isDeclaringTeam = 
  viewPosition === declarer || viewPosition === getOppositePosition(declarer)
// false in this case (West is defending)
```

### Get All Positions Relative to Current Player
```javascript
const viewData = createTableView(1, 'west', ctx)
const positions = viewData.positions

const topPlayer = positions.top        // 'east'
const leftPlayer = positions.left      // 'north'
const rightPlayer = positions.right    // 'south'
const bottomPlayer = positions.bottom  // 'west' (me)
```

### Filter Opponents
```javascript
const allPositions = ['south', 'west', 'north', 'east']
const myPosition = 'south'
const opponents = allPositions.filter(pos => 
  pos !== myPosition && 
  pos !== getOppositePosition(myPosition)
)
// ['west', 'east']
```

## Performance Tips

1. **Cache rotations** - Don't recalculate for same player
2. **Lazy load cards** - Load card data only when needed
3. **Minimize re-renders** - Update only changed seats
4. **Use CSS Grid** - More efficient than flexbox for this layout
5. **Event delegation** - Use single handler for multiple seats

## Debugging

### Check Position Mapping
```javascript
const positions = getRotatedPositions('west')
console.table(positions)
// {top: 'east', left: 'north', right: 'south', bottom: 'west'}
```

### Verify Card Visibility
```javascript
const viewData = createTableView(1, 'south', ctx)
console.log('My cards:', viewData.visibleCards.south)
console.log('Partner cards:', viewData.visibleCards.north)
console.log('Hidden cards:', viewData.visibleCards.west)
```

### Test Navigation
```javascript
// Open any position URL directly:
// http://localhost:5001/table?id=1&position=north
// http://localhost:5001/table?id=2&position=observer
```

## File Locations

- **Core logic**: `src/pages/table/table-view.js`
- **Rendering**: `src/pages/table/table.js`
- **Styling**: `src/pages/table/table.css`
- **HTML**: `src/pages/table/table.html`
- **Routing**: `src/routes.js`
- **Translations**: `src/i18n/i18n.js`
- **Lobby**: `src/pages/lobby/lobby.js`

## Related Documentation

- [MULTI_PERSPECTIVE_SYSTEM.md](./MULTI_PERSPECTIVE_SYSTEM.md) - Detailed system overview
- [VISUAL_EXAMPLES.md](./VISUAL_EXAMPLES.md) - Visual demonstrations
- [README.md](./README.md) - Project overview
