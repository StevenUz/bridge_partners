# Supabase Server-Authoritative Architecture

## Design Principles

### 1. **No Client Writes**
- Clients CANNOT directly INSERT/UPDATE/DELETE game state tables
- All mutations happen through Postgres RPC functions (SECURITY DEFINER)
- RPC functions validate rules and update state in atomic transactions

### 2. **Hand Privacy (Critical)**
- **hands_private**: Each player's cards, visible ONLY to owner
- **hands_public**: Dummy hand revealed after opening lead
- RLS enforces visibility at database level
- Spectators never see private hands

### 3. **Server-Authoritative Validation**
- Turn order enforcement
- Follow-suit rules
- Auction sequence validation  
- Seat ownership checks
- All in Postgres functions with row-level locking (SELECT ... FOR UPDATE)

## Schema Overview

### Privacy-Critical Tables
```sql
hands_private (board_id, seat, owner_user_id, cards)
  ↳ RLS: WHERE owner_user_id = auth.uid()
  
hands_public (board_id, seat, cards)
  ↳ RLS: WHERE room member
  ↳ Populated when dummy_revealed = true
```

### Core State Tables (Read-Only for Clients)
```sql
rooms → room_members → room_seats
  ↳ matches → boards → auctions/auction_calls
                     → tricks → plays
                     → board_result
game_events (append-only log)
```

### Client Access Pattern
```
Client → RPC function (validate + write) → State tables + game_events
                                         ↓
Client ← Realtime subscription ← game_events broadcast
Client ← room_snapshot() view ← Read with hand privacy
```

## RPC Functions (All SECURITY DEFINER)

### Room Management
- `create_room(code TEXT) → room_id UUID`
- `join_room(room_code TEXT, as_spectator BOOL)`  
- `take_seat(room_id UUID, seat INT)`  
- `leave_seat(room_id UUID)`

### Game Flow
- `start_match(room_id UUID) → match_id UUID`
  - Creates match, creates first board, deals hands
  
- `start_board(match_id UUID) → board_id UUID`  
  - Deals new board, populates hands_private
  - Sets dealer, vulnerability, current_turn_seat for auction
  
- `submit_call(board_id UUID, call_type TEXT, level INT, strain TEXT)`
  - Validates: current seat = auth user, auction order correct
  - Inserts auction_call
  - If 3 passes after bid: computes declarer/dummy/opening_leader
  - Sets board.status = 'playing', current_turn_seat = opening_leader

- `play_card(board_id UUID, card TEXT)`
  - Validates: current_turn_seat = auth user, card in hand, follow-suit
  - Inserts play
  - If first card played: sets dummy_revealed=true, copies to hands_public
  - When trick completes: determines winner, updates tricks count
  - Sets next current_turn_seat

## Hand Visibility Matrix

| User Type | Own Hand | Dummy (before lead) | Dummy (after lead) | Opponents |
|-----------|----------|---------------------|-------------------|-----------|
| Player    | ✅ Always | ❌ Never            | ✅ If declarer/dummy | ❌ Never  |
| Spectator | ❌ Never  | ❌ Never            | ✅ Yes             | ❌ Never  |

Implementation:
- **Own hand**: `hands_private WHERE owner_user_id = auth.uid()`
- **Dummy after lead**: `hands_public WHERE board.dummy_revealed = true`

## Transaction Safety

All RPC functions use:
```sql
SELECT * FROM boards WHERE id = board_id FOR UPDATE NOWAIT;
-- Prevents concurrent modifications
-- Transaction rolls back on constraint violation
```

## Event Log Pattern

Every state change appends to `game_events`:
```sql
INSERT INTO game_events (room_id, board_id, event_type, payload)
VALUES (room_id, board_id, 'card_played', jsonb_build_object(
  'seat', seat,
  'card', card,
  'trick_no', trick_no
));
```

Clients subscribe:
```javascript
supabase.channel(`room:${roomId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'game_events',
    filter: `room_id=eq.${roomId}`
  }, handleEvent)
```

## Client Query Pattern

Single snapshot query:
```sql
SELECT * FROM room_snapshot(room_id);
```

Returns:
- Room info + seats with players
- Current board status
- Auction history
- Played tricks
- Dummy public hand (if revealed)
- **Caller's private hand** (via RLS)
- Current turn indicator

## Why This Architecture?

### Advantages
1. **Security**: Impossible to cheat (client can't fake cards)
2. **Consistency**: Single source of truth in Postgres
3. **Simplicity**: No separate backend server needed
4. **Scalability**: Postgres handles concurrency
5. **Privacy**: Database enforces hand visibility

### Trade-offs
- More complex migrations (heavy Postgres functions)
- Validation logic in SQL (less familiar than JS)
- Requires Supabase Pro for custom RPC functions

## Implementation Files

1. **Migration 1**: Core tables, constraints, indexes
2. **Migration 2**: RLS policies (read-only for clients)
3. **Migration 3**: RPC functions with validation
4. **Migration 4**: Views and helper functions
