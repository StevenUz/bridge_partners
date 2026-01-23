# Visual Examples - Multi-Perspective System

## Perspective Views

Each player sees the table from their position, with other players rotated accordingly.

### South Player View
**URL**: `/table?id=1&position=south`

```
┌─────────────────────────────────────────┐
│                                         │
│   North (Partner)                       │
│   Ivan                                  │
│   ┌──────────────┐                      │
│   │   ♣ ♦ ♥ ♠   │                      │
│   │   13 cards   │                      │
│   └──────────────┘                      │
│                                         │
│ West (Opponent)    East (Opponent)      │
│ Marco             Maria                 │
│ ┌──────┐         ┌──────┐               │
│ │ ♠♠♠ │         │ ♥♥♥ │               │
│ │ 13  │         │ 13  │               │
│ └──────┘         └──────┘               │
│                                         │
│     South (You)                         │
│     Elena 👈                            │
│     ┌──────────────┐                    │
│     │ ♥ ♥ ♦ ♦ ♠   │ (your hand)       │
│     │   13 cards   │                    │
│     └──────────────┘                    │
│                                         │
└─────────────────────────────────────────┘
```

### West Player View
**URL**: `/table?id=1&position=west`

Same table, but rotated 90° counter-clockwise:

```
┌─────────────────────────────────────────┐
│                                         │
│  East (Opponent)                        │
│  Maria                                  │
│  ┌──────────────┐                       │
│  │   ♣ ♦ ♥ ♠   │                       │
│  │   13 cards   │                       │
│  └──────────────┘                       │
│                                         │
│ South (Opponent)   North (Partner)      │
│ Elena             Ivan                  │
│ ┌──────┐         ┌──────┐               │
│ │ ♠♠♠ │         │ ♥♥♥ │               │
│ │ 13  │         │ 13  │               │
│ └──────┘         └──────┘               │
│                                         │
│     West (You)                          │
│     Marco 👈                            │
│     ┌──────────────┐                    │
│     │ ♠ ♠ ♦ ♦ ♣   │ (your hand)       │
│     │   13 cards   │                    │
│     └──────────────┘                    │
│                                         │
└─────────────────────────────────────────┘
```

### North Player View
**URL**: `/table?id=1&position=north`

```
┌─────────────────────────────────────────┐
│                                         │
│   South (Partner)                       │
│   Elena                                 │
│   ┌──────────────┐                      │
│   │   ♣ ♦ ♥ ♠   │                      │
│   │   13 cards   │                      │
│   └──────────────┘                      │
│                                         │
│ East (Opponent)    West (Opponent)      │
│ Maria              Marco                │
│ ┌──────┐         ┌──────┐               │
│ │ ♥♥♥ │         │ ♠♠♠ │               │
│ │ 13  │         │ 13  │               │
│ └──────┘         └──────┘               │
│                                         │
│     North (You)                         │
│     Ivan 👈                             │
│     ┌──────────────┐                    │
│     │ ♠ ♠ ♦ ♦ ♣   │ (your hand)       │
│     │   13 cards   │                    │
│     └──────────────┘                    │
│                                         │
└─────────────────────────────────────────┘
```

### East Player View
**URL**: `/table?id=1&position=east`

```
┌─────────────────────────────────────────┐
│                                         │
│   West (Partner)                        │
│   Marco                                 │
│   ┌──────────────┐                      │
│   │   ♣ ♦ ♥ ♠   │                      │
│   │   13 cards   │                      │
│   └──────────────┘                      │
│                                         │
│ North (Opponent)   South (Opponent)     │
│ Ivan               Elena                │
│ ┌──────┐         ┌──────┐               │
│ │ ♣♣♣ │         │ ♠♠♠ │               │
│ │ 13  │         │ 13  │               │
│ └──────┘         └──────┘               │
│                                         │
│     East (You)                          │
│     Maria 👈                            │
│     ┌──────────────┐                    │
│     │ ♥ ♥ ♦ ♦ ♣   │ (your hand)       │
│     │   13 cards   │                    │
│     └──────────────┘                    │
│                                         │
└─────────────────────────────────────────┘
```

### Observer View
**URL**: `/table?id=1&position=observer`

Observer sees the same as South player (partner's view):

```
┌─────────────────────────────────────────┐
│  OBSERVER MODE  👁️                      │
│                                         │
│   North (Partner)                       │
│   Ivan                                  │
│   ┌──────────────┐                      │
│   │   ♣ ♦ ♥ ♠   │                      │
│   │   13 cards   │                      │
│   └──────────────┘                      │
│                                         │
│ West (Opponent)    East (Opponent)      │
│ Marco             Maria                 │
│ ┌──────┐         ┌──────┐               │
│ │ ♠♠♠ │         │ ♥♥♥ │               │
│ │ 13  │         │ 13  │               │
│ └──────┘         └──────┘               │
│                                         │
│     South (Player)                      │
│     Elena                               │
│     ┌──────────────┐                    │
│     │ ♥ ♥ ♦ ♦ ♠   │ (hidden)          │
│     │   13 cards   │                    │
│     └──────────────┘                    │
│                                         │
│  Observers: Peter, Maya                 │
└─────────────────────────────────────────┘
```

## Position Indicator Examples

### For South Player
```
ℹ️  Your Position: South
```
- Background: Light blue
- Text: Dark blue
- Icon: Person circle

### For West Player
```
ℹ️  Your Position: West
```
- Same styling, different position name

### For Observer
```
👁️  Observer Mode
```
- Background: Light gray
- Text: Dark gray
- Icon: Eye

## Visual Styling

### Current Player Card (Bottom Position)

```
┌────────────────────┐
│   ◀ South ►        │ ← Position label in red
│  Elena             │ ← Player name
│ ─────────────────  │
│ ♥ ♦ ♠ ♣ ♥ ♦ ♠     │ ← Your cards (fully visible)
│   13 cards         │
└────────────────────┘
  ↑ Red border (3px)
  ↑ Golden background
  ↑ Slightly scaled up (1.05x)
```

### Opponent Card (Left/Right/Top Position)

```
┌──────────────┐
│  West        │ ← Neutral green text
│ Marco        │ ← Player name
│ ────────────  │
│ ♠ ♠ ♠ ♠    │ ← Cards not shown (hidden)
│  13 cards    │
└──────────────┘
  ↑ Green border (2px)
  ↑ Standard white background
```

### Empty Seat

```
┌──────────────┐
│  East        │
│ Open         │ ← Grayed out text
│ ────────────  │
│ Empty        │
│  0 cards     │
└──────────────┘
  ↑ Light gray styling
  ↑ Not clickable in this implementation
```

## Bridge Layout Grid

The positions are arranged using CSS Grid:

```
        ┌─────────┐
        │ North   │  (grid column 2, row 1)
        └─────────┘
             ↑
   ┌──────────┴──────────┐
   │                      │
┌──────┐            ┌──────┐
│ West │            │ East │
└──────┘            └──────┘
   │                      │
   └──────────┬──────────┘
             ↓
        ┌─────────┐
        │ South   │  (grid column 2, row 3)
        └─────────┘
      (YOUR POSITION)
```

Grid configuration:
- **Columns**: 1 (left) | 2 (center) | 3 (right)
- **Rows**: 1 (top) | 2 (middle) | 3 (bottom)
- **Gap**: 1.5rem (24px)
- **Background**: Gradient from dark to bright green (card table aesthetic)

## Translation Examples

### English
- "Your Position: South"
- "Observer Mode"
- "13 cards"
- "South, West, North, East"

### Bulgarian
- "Вашата позиция: Юг"
- "Режим на наблюдател"
- "13 карти"
- "Юг, Запад, Север, Изток"

## Demo Mode - Position Switcher

Located below the position indicator, the switcher shows:

```
┌─────────┬─────────┬─────────┬─────────┬──────────────┐
│  South  │  West   │ North   │  East   │ Observer Mode│
└─────────┴─────────┴─────────┴─────────┴──────────────┘
     ↑
  Active (blue background)
```

- Click any button to instantly switch to that perspective
- Current position highlighted in blue
- Others shown in light blue outline
- Used for testing and demonstration

## Responsive Behavior

### Desktop (> 768px)
- Full grid layout as shown above
- Seat cards: min-width 160px
- Icons: 2rem (32px)
- Position labels: 1rem (16px)

### Tablet/Mobile (≤ 768px)
- Columns scaled down slightly
- Seat cards: min-width 120px
- Icons: 1.5rem (24px)
- Position labels: 0.85rem (13.6px)
- Gap reduced: 1rem (16px)

## Animation Examples

### Seat Card Hover (Desktop)
```
Before: box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15)
After:  box-shadow: 0 6px 20px rgba(192, 57, 43, 0.3)
Transition: 0.3s ease
```

### Current Player Scale
```
transform: scale(1.05)
Makes current player's card 5% larger for emphasis
```

### Position Button Highlight
```
Background: var(--velvet-bright)
Text color: white
Border radius: 8px per button, smoother on outer buttons
```

## Real-World Scenario

When a game is in progress and it's the West player's turn:

1. **West player logs in** → `/table?id=1&position=west`
2. **Sees layout rotated** with themselves at bottom
3. **Partner (East) at top** (opposite position)
4. **Opponents (South, North) on sides**
5. **Their hand visible**, others shown as card counts
6. **Can play cards** by clicking their hand
7. **Other players see rotated view** of the same table

This ensures each player sees:
- Their own cards (for decision making)
- Partner's position (for communication)
- Opponent positions (to track play)
- All played cards from all positions

Perfect for an intuitive bridge gaming experience!
