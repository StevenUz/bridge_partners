# Supabase Database Schema - Bridge Game

## Schema Overview

The database schema supports a complete multiplayer Bridge game with real-time synchronization, hand privacy, and comprehensive game state tracking.

### Tables & Relationships

```
profiles (users)
    ↓ creates
rooms (game tables)
    ├→ room_members (players/spectators)
    ├→ room_seats (N/S/E/W positions)
    └→ matches (16-deal vulnerability cycle)
         └→ boards (individual deals)
              ├→ hands (4 × 13 cards)
              ├→ auctions
              │    └→ auction_calls
              ├→ tricks
              │    └→ plays
              └→ board_results

game_events (append-only event log)
```

## Key Design Decisions

### 1. Hand Privacy
- All 4 hands stored in `hands` table
- **RLS allows room members to read all hands** (basic protection)
- **Application layer MUST enforce visibility rules:**
  - Players see only their own hand
  - Dummy visible after opening lead
  - Declarer sees dummy
  - Defenders never see each other's hands
- Alternative: Create a Postgres function/view that filters hands based on board status

### 2. Event Sourcing
- `game_events` table = append-only log
- Enables:
  - Real-time pub/sub (Supabase Realtime)
  - Reconnection (fetch events since timestamp)
  - Replay functionality
  - Audit trail

### 3. Denormalization
- `rooms.current_match_id` - quick access to active match
- `boards.current_trick_number` - avoid joins
- `boards.status` - cached state

### 4. Vulnerability Cycle
- `matches.deal_cycle_position` (0-15)
- Pattern: `0_-_|_+_-_|_+_0_|_+_0_-_+_0_-_|`
  - `0` = none, `-` = EW, `|` = NS, `+` = both
- Resets when player leaves/joins

## Custom Types (Enums)

```sql
seat_position: north, south, east, west
strain: clubs, diamonds, hearts, spades, notrump
vulnerability: none, ns, ew, both
room_status: waiting, active, completed
board_status: dealing, auction, play, completed
double_status: none, doubled, redoubled
call_type: bid, pass, double, redouble
member_role: player, spectator
event_type: room_created, player_joined, player_seated, 
            board_started, auction_call, card_played, etc.
```

## Core Queries

### 1. Create Room & Join

```sql
-- Create room
INSERT INTO rooms (name, created_by)
VALUES ('My Bridge Table', auth.uid())
RETURNING *;

-- Join room as member
INSERT INTO room_members (room_id, profile_id, role)
VALUES ('room-uuid', auth.uid(), 'player')
RETURNING *;

-- Take a seat
UPDATE room_seats
SET profile_id = auth.uid(), seated_at = NOW()
WHERE room_id = 'room-uuid' AND seat_position = 'north' AND profile_id IS NULL
RETURNING *;
```

### 2. Get Room Snapshot (Full State)

```sql
-- Get room with current match and board
SELECT 
    r.*,
    m.id as match_id,
    m.deal_cycle_position,
    b.id as board_id,
    b.board_number,
    b.dealer,
    b.vulnerability,
    b.status as board_status,
    b.current_trick_number
FROM rooms r
LEFT JOIN matches m ON m.id = r.current_match_id
LEFT JOIN boards b ON b.match_id = m.id AND b.status != 'completed'
WHERE r.id = 'room-uuid';

-- Get all seats
SELECT * FROM room_seats
WHERE room_id = 'room-uuid'
ORDER BY seat_position;

-- Get all members
SELECT rm.*, p.username, p.display_name
FROM room_members rm
JOIN profiles p ON p.id = rm.profile_id
WHERE rm.room_id = 'room-uuid';
```

### 3. Start New Match & Deal Board

```sql
-- Create match
INSERT INTO matches (room_id, deal_cycle_position)
VALUES ('room-uuid', 0)
RETURNING *;

-- Update room's current match
UPDATE rooms
SET current_match_id = 'match-uuid', status = 'active'
WHERE id = 'room-uuid';

-- Create first board
INSERT INTO boards (match_id, board_number, dealer, vulnerability, status)
VALUES ('match-uuid', 1, 'north', 'none', 'dealing')
RETURNING *;

-- Deal hands (4 inserts)
INSERT INTO hands (board_id, seat_position, cards)
VALUES 
    ('board-uuid', 'north', '[{"rank":"A","suit":"S"}, ...]'::jsonb),
    ('board-uuid', 'south', '[...]'::jsonb),
    ('board-uuid', 'east', '[...]'::jsonb),
    ('board-uuid', 'west', '[...]'::jsonb);

-- Log event
INSERT INTO game_events (room_id, board_id, event_type, event_data, created_by)
VALUES ('room-uuid', 'board-uuid', 'board_started', 
        '{"board_number":1,"dealer":"north"}'::jsonb, auth.uid());
```

### 4. Auction (Bidding)

```sql
-- Create auction record
INSERT INTO auctions (board_id)
VALUES ('board-uuid')
RETURNING *;

-- Add call
INSERT INTO auction_calls (auction_id, sequence, seat_position, call_type, level, strain)
VALUES ('auction-uuid', 0, 'north', 'bid', 1, 'notrump')
RETURNING *;

-- Pass
INSERT INTO auction_calls (auction_id, sequence, seat_position, call_type)
VALUES ('auction-uuid', 1, 'east', 'pass')
RETURNING *;

-- Complete auction
UPDATE auctions
SET 
    final_contract_level = 3,
    final_contract_strain = 'notrump',
    double_status = 'none',
    declarer = 'south',
    completed_at = NOW()
WHERE board_id = 'board-uuid';

UPDATE boards
SET status = 'play'
WHERE id = 'board-uuid';
```

### 5. Trick Play

```sql
-- Create first trick
INSERT INTO tricks (board_id, trick_number, lead_position)
VALUES ('board-uuid', 1, 'west')
RETURNING *;

-- Play card
INSERT INTO plays (trick_id, sequence, seat_position, card_rank, card_suit)
VALUES ('trick-uuid', 1, 'west', '5', 'S')
RETURNING *;

-- Complete trick
UPDATE tricks
SET winner_position = 'north', completed_at = NOW()
WHERE id = 'trick-uuid';

UPDATE boards
SET current_trick_number = 2
WHERE id = 'board-uuid';
```

### 6. Board Completion & Scoring

```sql
-- Insert result
INSERT INTO board_results (board_id, tricks_taken_declarer, score_ns, score_ew, imps)
VALUES ('board-uuid', 10, 430, 0, 10)
RETURNING *;

-- Mark board complete
UPDATE boards
SET status = 'completed'
WHERE id = 'board-uuid';

-- Log event
INSERT INTO game_events (room_id, board_id, event_type, event_data, created_by)
VALUES ('room-uuid', 'board-uuid', 'board_completed',
        '{"tricks":10,"score_ns":430}'::jsonb, auth.uid());
```

### 7. Real-time Event Subscription

```javascript
// Subscribe to room events (Supabase Realtime)
const subscription = supabase
  .channel(`room:${roomId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'game_events',
      filter: `room_id=eq.${roomId}`
    },
    (payload) => {
      handleGameEvent(payload.new);
    }
  )
  .subscribe();
```

### 8. Reconnection (Fetch Recent Events)

```sql
-- Get all events since last connection
SELECT *
FROM game_events
WHERE room_id = 'room-uuid'
  AND created_at > '2026-02-04T10:00:00Z'
ORDER BY created_at ASC;
```

### 9. Board Replay (Load Full History)

```sql
-- Get complete board state
SELECT 
    b.*,
    a.final_contract_level,
    a.final_contract_strain,
    a.double_status,
    a.declarer,
    br.tricks_taken_declarer,
    br.score_ns
FROM boards b
LEFT JOIN auctions a ON a.board_id = b.id
LEFT JOIN board_results br ON br.board_id = b.id
WHERE b.id = 'board-uuid';

-- Get all auction calls
SELECT *
FROM auction_calls ac
JOIN auctions a ON a.id = ac.auction_id
WHERE a.board_id = 'board-uuid'
ORDER BY ac.sequence;

-- Get all tricks and plays
SELECT 
    t.trick_number,
    t.lead_position,
    t.winner_position,
    p.sequence,
    p.seat_position,
    p.card_rank,
    p.card_suit
FROM tricks t
LEFT JOIN plays p ON p.trick_id = t.id
WHERE t.board_id = 'board-uuid'
ORDER BY t.trick_number, p.sequence;
```

### 10. Get Visible Hand (Application Logic)

```javascript
// Client-side: determine which hands user can see
async function getVisibleHands(boardId, userId) {
  // Get board state
  const { data: board } = await supabase
    .from('boards')
    .select('*, auctions(*)')
    .eq('id', boardId)
    .single();

  // Get user's seat
  const { data: seat } = await supabase
    .from('room_seats')
    .select('seat_position')
    .eq('room_id', board.room_id)
    .eq('profile_id', userId)
    .single();

  // Determine dummy position
  const declarer = board.auctions?.declarer;
  const dummy = getPartnerPosition(declarer);

  // Get hands
  const { data: hands } = await supabase
    .from('hands')
    .select('*')
    .eq('board_id', boardId);

  // Filter based on visibility rules
  return hands.filter(hand => {
    // Own hand always visible
    if (hand.seat_position === seat.seat_position) return true;
    
    // Dummy visible after opening lead (check if trick 1 has play)
    if (hand.seat_position === dummy && board.status === 'play') {
      // Check if opening lead has been made
      const { data: openingLead } = await supabase
        .from('plays')
        .select('id')
        .eq('trick_id', /* first trick */)
        .limit(1);
      return openingLead.length > 0;
    }
    
    return false; // Hide other hands
  });
}
```

## Security Notes

### RLS Policies Summary

- **Profiles**: Public read, users update own
- **Rooms**: Public read, creators update
- **Room Members**: Members can view, anyone can join/leave
- **Room Seats**: Members view, players take empty seats
- **Game State** (boards, hands, auctions, tricks, plays, results): Room members can view
- **Events**: Room members can view/insert

### Hand Privacy Warning

**The current RLS setup allows room members to query all hands directly.** This is pragmatic for server-authoritative games but requires application-layer enforcement.

#### Options for Enhanced Security:

1. **Current approach** (recommended for MVP):
   - RLS allows room members to read all hands
   - Client code enforces visibility rules
   - Server validates all moves

2. **Postgres View** (more secure):
   ```sql
   CREATE VIEW visible_hands AS
   SELECT h.*
   FROM hands h
   JOIN boards b ON b.id = h.board_id
   JOIN auctions a ON a.board_id = b.id
   WHERE 
     h.seat_position = get_seat_position(
       (SELECT room_id FROM matches WHERE id = b.match_id),
       auth.uid()
     )
     OR (
       h.seat_position = get_partner(a.declarer) 
       AND b.status = 'play'
       AND EXISTS (SELECT 1 FROM plays WHERE trick_id = (
         SELECT id FROM tricks WHERE board_id = b.id AND trick_number = 1 LIMIT 1
       ))
     );
   ```

3. **Encrypted Hands** (maximum security):
   - Store hands encrypted with per-board keys
   - Decrypt only when allowed by game rules
   - Requires key management logic

## Indexes Summary

Critical indexes for performance:
- `game_events(room_id, created_at DESC)` - real-time sync
- `auction_calls(auction_id, sequence)` - ordered bidding
- `plays(trick_id, sequence)` - ordered play
- `boards(match_id)` - board lookup
- `room_members(room_id)` - membership checks

## Next Steps

1. **TypeScript Types**: Generate with `supabase gen types typescript`
2. **Realtime Channels**: Set up pub/sub for game events
3. **Edge Functions**: Create server-authoritative validation functions
4. **Testing**: Seed test data and verify queries
5. **Client Integration**: Connect frontend to Supabase client

## Example: Complete Game Flow

```sql
-- 1. Create room
INSERT INTO rooms (name, created_by) VALUES ('Table 1', auth.uid()) RETURNING id;

-- 2. Four players join and take seats
INSERT INTO room_members (room_id, profile_id, role) VALUES ('room-id', 'user1', 'player');
UPDATE room_seats SET profile_id = 'user1' WHERE room_id = 'room-id' AND seat_position = 'north';
-- (repeat for south, east, west)

-- 3. Start match
INSERT INTO matches (room_id) VALUES ('room-id') RETURNING id;
UPDATE rooms SET current_match_id = 'match-id' WHERE id = 'room-id';

-- 4. Deal first board
INSERT INTO boards (match_id, board_number, dealer, vulnerability) 
VALUES ('match-id', 1, 'north', 'none') RETURNING id;

-- 5. Deal hands (server-side, secure)
-- [Deal cards to all 4 positions]

-- 6. Auction phase
INSERT INTO auctions (board_id) VALUES ('board-id');
-- [Players bid until 3 passes]
UPDATE auctions SET final_contract_level = 3, final_contract_strain = 'notrump', declarer = 'south';

-- 7. Play phase
-- [13 tricks, 4 plays per trick]

-- 8. Score board
INSERT INTO board_results (board_id, tricks_taken_declarer, score_ns, score_ew) 
VALUES ('board-id', 10, 430, 0);

-- 9. Next board
-- [Repeat from step 4]
```

## Vulnerability Cycle Reference

16-deal pattern (matches.deal_cycle_position):
```
Position | Dealer | Vulnerability
---------|--------|---------------
   0     | North  | None
   1     | East   | NS only
   2     | South  | EW only
   3     | West   | Both
   4     | North  | EW only
   5     | East   | Both
   6     | South  | None
   7     | West   | Both
   8     | North  | None
   9     | East   | EW only
  10     | South  | Both
  11     | West   | None
  12     | North  | EW only
  13     | East   | Both
  14     | South  | None
  15     | West   | EW only
```

Dealer rotates: N → E → S → W → N...
