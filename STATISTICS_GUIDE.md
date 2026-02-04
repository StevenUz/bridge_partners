# Player Statistics Guide

**Comprehensive guide for player statistics tracking and display**

---

## Overview

The statistics system tracks detailed performance metrics for each player across all completed boards:
- Individual performance (as declarer, dummy, defender)
- Partnership history (who played with whom)
- Success rates and scoring
- Slam bidding achievements

---

## Database Schema

### Table: `player_statistics`

**Purpose:** Aggregated statistics for each player

```sql
CREATE TABLE player_statistics (
    id uuid PRIMARY KEY,
    player_id uuid REFERENCES profiles(id),
    
    -- Game counts
    boards_played int DEFAULT 0,
    boards_completed int DEFAULT 0,
    
    -- Role-specific
    boards_as_declarer int DEFAULT 0,
    boards_as_dummy int DEFAULT 0,
    boards_as_defender int DEFAULT 0,
    
    -- Contract results
    contracts_made int DEFAULT 0,
    contracts_made_with_overtricks int DEFAULT 0,
    contracts_failed int DEFAULT 0,
    
    -- Defense
    contracts_defeated int DEFAULT 0,
    
    -- Scoring
    total_score int DEFAULT 0,
    
    -- Slams
    small_slams_bid int DEFAULT 0,
    grand_slams_bid int DEFAULT 0
);
```

**Key Fields:**

| Field | Description |
|-------|-------------|
| `boards_played` | Total boards started |
| `boards_completed` | Total boards finished |
| `boards_as_declarer` | Count of boards where player declared contract |
| `boards_as_dummy` | Count of boards as dummy |
| `boards_as_defender` | Count of boards as defender |
| `contracts_made` | Made exactly (no overtricks) |
| `contracts_made_with_overtricks` | Made with overtricks (добри взятки) |
| `contracts_failed` | Failed contracts (вътрешни взятки) |
| `contracts_defeated` | As defender, defeated opponents |
| `total_score` | Cumulative points (can be negative) |
| `small_slams_bid` | Number of 6-level contracts bid |
| `grand_slams_bid` | Number of 7-level contracts bid |

---

### Table: `partnerships`

**Purpose:** Track partnership history

```sql
CREATE TABLE partnerships (
    id uuid PRIMARY KEY,
    player_id uuid,      -- Smaller UUID
    partner_id uuid,     -- Larger UUID
    boards_together int DEFAULT 0,
    wins_together int DEFAULT 0,
    
    CONSTRAINT partnerships_ordered CHECK (player_id < partner_id)
);
```

**Key:** Ensures each partnership is stored only once (A-B, not both A-B and B-A)

---

## Automatic Updates

### Function: `update_statistics_after_board(board_id)`

**Called automatically after each board completion** to:
1. Update all 4 players' statistics
2. Update partnership records (declarer+dummy, defender1+defender2)
3. Increment counts (boards_played, contracts_made, etc.)
4. Add/subtract scores

**Example trigger usage:**

```sql
-- In your board completion logic
UPDATE boards SET status = 'completed' WHERE id = 'xxx';

-- Then call:
SELECT update_statistics_after_board('xxx');
```

---

## Query Functions

### 1. `get_player_statistics(player_id)`

Returns detailed stats for one player.

**Example:**

```typescript
const stats = await supabaseClient.rpc('get_player_statistics', {
  p_player_id: userId
});

console.log(stats[0]);
// {
//   player_id: '...',
//   display_name: 'Иван Петров',
//   boards_played: 145,
//   boards_completed: 145,
//   boards_as_declarer: 38,
//   boards_as_dummy: 35,
//   boards_as_defender: 72,
//   contracts_made: 22,
//   contracts_made_with_overtricks: 14,
//   contracts_failed: 2,
//   contracts_defeated: 35,
//   total_score: 2850,
//   small_slams_bid: 4,
//   grand_slams_bid: 1,
//   success_rate_as_declarer: 94.74,  // Calculated
//   defense_success_rate: 48.61       // Calculated
// }
```

---

### 2. `get_player_partnerships(player_id)`

Returns all partners of a player.

**Example:**

```typescript
const partners = await supabaseClient.rpc('get_player_partnerships', {
  p_player_id: userId
});

console.log(partners);
// [
//   {
//     partner_id: '222...',
//     partner_name: 'Мария Георгиева',
//     boards_together: 34,
//     wins_together: 26,
//     win_rate: 76.47
//   },
//   ...
// ]
```

---

### 3. `get_leaderboard(limit)`

Returns top players by total score.

**Example:**

```typescript
const leaderboard = await supabaseClient.rpc('get_leaderboard', {
  p_limit: 10
});

console.log(leaderboard);
// [
//   {
//     rank: 1,
//     player_id: '222...',
//     display_name: 'Мария Георгиева',
//     boards_completed: 198,
//     total_score: 4120,
//     success_rate: 96.15,
//     small_slams: 6,
//     grand_slams: 2
//   },
//   ...
// ]
```

---

### 4. `get_best_partnerships(min_boards, limit)`

Returns best partnerships by win rate.

**Example:**

```typescript
const bestPairs = await supabaseClient.rpc('get_best_partnerships', {
  p_min_boards: 5,
  p_limit: 10
});

console.log(bestPairs);
// [
//   {
//     rank: 1,
//     player1_id: '111...',
//     player1_name: 'Иван Петров',
//     player2_id: '222...',
//     player2_name: 'Мария Георгиева',
//     boards_together: 34,
//     wins_together: 26,
//     win_rate: 76.47
//   },
//   ...
// ]
```

---

## Client Integration

### Import API

```typescript
import {
  getPlayerStatistics,
  getPlayerPartnerships,
  getLeaderboard,
  getBestPartnerships,
  getMyStatistics,
  getMyPartnerships,
  formatScore,
  formatPercentage,
  getScoreColorClass,
  getWinRateColorClass
} from './api/statistics';
```

### Display Player Stats

```typescript
// Get current user's stats
const stats = await getMyStatistics();

if (stats) {
  console.log(`Total Score: ${formatScore(stats.total_score)}`);
  console.log(`Success Rate: ${formatPercentage(stats.success_rate_as_declarer)}`);
  console.log(`Slams: ${stats.small_slams_bid} small, ${stats.grand_slams_bid} grand`);
}
```

### Display Partnerships

```typescript
const partners = await getMyPartnerships();

partners.forEach(p => {
  console.log(
    `${p.partner_name}: ${p.boards_together} игри, ` +
    `${formatPercentage(p.win_rate)} успех`
  );
});
```

### Display Leaderboard

```typescript
const top10 = await getLeaderboard(10);

top10.forEach(entry => {
  console.log(
    `#${entry.rank}: ${entry.display_name} - ` +
    `${formatScore(entry.total_score)} точки`
  );
});
```

---

## Sample Data

The migration includes 6 sample players with realistic statistics:

### Иван Петров
- 145 игри
- 2850 точки
- 94.7% успех като разиграващ
- 4 малки шлема, 1 голям шлем

### Мария Георгиева
- 198 игри (най-много опит)
- 4120 точки (№1 в класацията)
- 96.2% успех
- 6 малки шлема, 2 големи шлема

### Георги Димитров
- 87 игри
- 1240 точки
- Среден играч

### Елена Стоянова
- 42 игри (начинаещ)
- -320 точки (все още се учи)
- 0 шлема

### Николай Иванов
- 112 игри
- 1880 точки
- Добър защитник (56% успех при защита)
- 3 малки шлема

### Стефан Тодоров
- 76 игри
- 980 точки
- Агресивен играч (много шлемове, но и повече провали)
- 5 малки шлема, 1 голям шлем

---

## UI Examples

### Statistics Page Layout

```
┌─────────────────────────────────────────┐
│  СТАТИСТИКА - Иван Петров              │
├─────────────────────────────────────────┤
│                                         │
│  Общо игри: 145                        │
│  Общо точки: +2850 ✅                  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ КЪМ РАЗИГРАВАЩ/МОР              │   │
│  │ Игри: 73 (38 разиграващ + 35 мор)│  │
│  │ Успех: 94.7%                     │   │
│  │ - Изкарани: 36 (22+14 с добри)   │   │
│  │ - Провалени: 2 (с вътрешни)      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ КЪМ ЗАЩИТНИК                     │   │
│  │ Игри: 72                         │   │
│  │ Вкарани в неуспех: 35 (48.6%)    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ ШЛЕМОВЕ                          │   │
│  │ 🏆 Малки шлемове: 4               │   │
│  │ 🏆🏆 Големи шлемове: 1             │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ ПАРТНЬОРИ                        │   │
│  │ 1. Мария (34 игри, 76% успех) ✅  │   │
│  │ 2. Георги (18 игри, 67% успех)   │   │
│  │ 3. Николай (14 игри, 71% успех)  │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### Leaderboard View

```
┌─────────────────────────────────────────┐
│  КЛАСАЦИЯ - Топ 10                     │
├─────────────────────────────────────────┤
│  #  Играч              Игри   Точки    │
├─────────────────────────────────────────┤
│  1  Мария Георгиева    198    +4120 ✅ │
│  2  Иван Петров        145    +2850 ✅ │
│  3  Николай Иванов     112    +1880 ✅ │
│  4  Георги Димитров     87    +1240 ✅ │
│  5  Стефан Тодоров      76     +980 ✅ │
│  6  Елена Стоянова      42     -320 ❌ │
└─────────────────────────────────────────┘
```

---

## Migration Instructions

### Step 1: Apply Migrations

```bash
# Apply statistics tables
psql -d your_db -f migrations/18_create_player_statistics.sql

# Apply query functions
psql -d your_db -f migrations/19_add_statistics_queries.sql
```

### Step 2: Verify Sample Data

```sql
-- Check sample players
SELECT * FROM profiles 
WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

-- Check statistics
SELECT 
  p.display_name,
  ps.boards_completed,
  ps.total_score
FROM player_statistics ps
JOIN profiles p ON p.id = ps.player_id
ORDER BY ps.total_score DESC;

-- Check partnerships
SELECT 
  p1.display_name as player1,
  p2.display_name as player2,
  pt.boards_together,
  pt.wins_together
FROM partnerships pt
JOIN profiles p1 ON p1.id = pt.player_id
JOIN profiles p2 ON p2.id = pt.partner_id
ORDER BY pt.boards_together DESC;
```

### Step 3: Hook Update Function

In your board completion RPC (`play_card` when trick 13 ends):

```sql
-- After updating board_results
INSERT INTO board_results (...) VALUES (...);

-- Update statistics
PERFORM update_statistics_after_board(p_board_id);

-- Insert game event
INSERT INTO game_events (event_type, event_data)
VALUES ('board_completed', jsonb_build_object(...));
```

---

## Notes

### Slam Counting
- Both partners count the slam (declarer + dummy)
- Example: If North-South bid 6♠, both North and South get +1 to `small_slams_bid`

### Score Calculation
- Uses `board_results.score_ns` and `score_ew`
- Declarer/dummy get NS score
- Defenders get EW score
- Can be negative (losses)

### Partnership Ordering
- `player_id < partner_id` ensures uniqueness
- Query function handles both directions automatically

### Performance
- `player_statistics` has one row per player (fast lookups)
- Indexes on key columns for sorting
- RLS allows public read (for leaderboards)

---

**Document Status:** Complete  
**Last Updated:** February 4, 2026
