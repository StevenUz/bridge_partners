# Security Validation Checklist

**Run these tests against your Supabase database to verify privacy & anti-cheat properties.**

---

## Phase 1: RLS Enforcement Tests

### Test 1.1: hands_private - Owner Can Read

```sql
-- AS USER A (authenticated as user_a_id)
SET SESSION AUTHORIZATION 'user_a_id';
SET search_path = public;

-- Create test board
INSERT INTO boards (match_id, board_number, dealer_seat, vulnerability, status)
VALUES ('test-match-1', 1, 0, 'none', 'auction')
RETURNING id AS board_id;

-- Create hands for all 4 seats
INSERT INTO hands_private (board_id, seat, owner_user_id, cards)
VALUES
  ('test-board-1', 0, 'user_a_id', '["AS","KS","QS","JS"]'),
  ('test-board-1', 1, 'user_b_id', '["AH","KH","QH","JH"]'),
  ('test-board-1', 2, 'user_c_id', '["AD","KD","QD","JD"]'),
  ('test-board-1', 3, 'user_d_id', '["AC","KC","QC","JC"]');

-- User A tries to read own hand
SELECT seat, array_length(cards, 1) as card_count 
FROM hands_private 
WHERE board_id = 'test-board-1' AND seat = 0;

-- EXPECTED: ✅ 1 row (seat 0, 4 cards)
```

### Test 1.2: hands_private - Non-Owner Cannot Read

```sql
-- AS USER B (authenticated as user_b_id)
SET SESSION AUTHORIZATION 'user_b_id';
SET search_path = public;

-- Try to read User A's hand
SELECT seat, array_length(cards, 1) as card_count 
FROM hands_private 
WHERE board_id = 'test-board-1' AND seat = 0;

-- EXPECTED: ❌ 0 rows (RLS filters to owner_user_id = user_b_id)
-- If you get rows, RLS is broken ⚠️
```

### Test 1.3: hands_private - Anonymous Cannot Read

```sql
-- AS ANONYMOUS (no auth)
RESET SESSION AUTHORIZATION;

SELECT * FROM hands_private WHERE board_id = 'test-board-1';

-- EXPECTED: ❌ 0 rows (not authenticated)
-- If you get rows, RLS is broken ⚠️
```

### Test 1.4: hands_public - Requires dummy_revealed Flag

```sql
-- AS AUTHENTICATED USER
SET SESSION AUTHORIZATION 'user_a_id';

-- Try to read hands_public (dummy not revealed yet)
SELECT * FROM hands_public WHERE board_id = 'test-board-1';

-- EXPECTED: ❌ 0 rows (board.dummy_revealed = false)

-- Insert dummy hand anyway (simulation)
INSERT INTO hands_public (board_id, seat, cards)
VALUES ('test-board-1', 2, '["AD","KD","QD","JD"]');

-- Try to read again (still blocked by RLS)
SELECT * FROM hands_public WHERE board_id = 'test-board-1';

-- EXPECTED: ❌ 0 rows (RLS still blocks because dummy_revealed = false)

-- Update board to reveal dummy
UPDATE boards SET dummy_revealed = true WHERE id = 'test-board-1';

-- Try to read hands_public again
SELECT * FROM hands_public WHERE board_id = 'test-board-1';

-- EXPECTED: ✅ 1 row (dummy's hand visible now)
```

### Test 1.5: No Client INSERT Allowed

```sql
-- AS AUTHENTICATED USER
SET SESSION AUTHORIZATION 'user_a_id';

-- Try to INSERT directly into auction_calls
INSERT INTO auction_calls (auction_id, sequence, seat_int, call_type)
VALUES ('test-auction-1', 0, 0, 'pass'::call_type);

-- EXPECTED: ❌ ERROR: new row violates row-level security policy
-- Error message should mention "no insert policy"

-- Verify by checking if error occurred
-- If insert succeeded, RLS is broken ⚠️
```

### Test 1.6: No Client UPDATE Allowed

```sql
-- AS AUTHENTICATED USER
SET SESSION AUTHORIZATION 'user_a_id';

-- Try to UPDATE boards directly
UPDATE boards SET current_turn_seat = 1 WHERE id = 'test-board-1';

-- EXPECTED: ❌ ERROR: new row violates row-level security policy
-- If update succeeded, RLS is broken ⚠️
```

---

## Phase 2: RPC Function Tests

### Test 2.1: Turn Authority - Valid Turn

```sql
-- Setup: Create match with 4 seated players
-- Current board should have current_turn_seat = 0 (dealer North)

-- AS USER A (seat 0 - dealer)
SET SESSION AUTHORIZATION 'user_a_id';

-- Try to play a valid card
SELECT play_card('test-board-1', 'AS') as play_id;

-- EXPECTED: ✅ Returns UUID (play succeeds)
```

### Test 2.2: Turn Authority - Invalid Turn

```sql
-- Setup: current_turn_seat = 1 (after User A played)

-- AS USER C (seat 2 - not current player)
SET SESSION AUTHORIZATION 'user_c_id';

-- Try to play out of turn
SELECT play_card('test-board-1', 'AD');

-- EXPECTED: ❌ ERROR: 'Not your turn' or similar
-- If it succeeds, turn validation is broken ⚠️
```

### Test 2.3: Card Ownership - Card in Hand

```sql
-- Setup: User A has 'AS' in hand at seat 0

-- AS USER A
SET SESSION AUTHORIZATION 'user_a_id';

SELECT play_card('test-board-1', 'AS') as play_id;

-- EXPECTED: ✅ Returns UUID (card exists in hand)
```

### Test 2.4: Card Ownership - Card Not in Hand

```sql
-- Setup: User A does NOT have 'KC' in hand

-- AS USER A
SET SESSION AUTHORIZATION 'user_a_id';

SELECT play_card('test-board-1', 'KC');

-- EXPECTED: ❌ ERROR: 'Card not in hand' or similar
-- If it succeeds, card validation is broken ⚠️
```

### Test 2.5: Follow-Suit Enforcement

```sql
-- Setup: Spade lead suit, User A has spades in hand

-- AS USER A (turn to play)
SET SESSION AUTHORIZATION 'user_a_id';

-- Try to play heart (wrong suit)
SELECT play_card('test-board-1', 'AH');

-- EXPECTED: ❌ ERROR: 'Must follow suit' or similar
-- If it succeeds, follow-suit validation is broken ⚠️

-- Play spade (correct suit)
SELECT play_card('test-board-1', 'AS');

-- EXPECTED: ✅ Returns UUID (correct)
```

### Test 2.6: Follow-Suit With Void

```sql
-- Setup: User A has NO spades (void in spades)

-- Spade is lead suit, User A tries to discard
SELECT play_card('test-board-1', 'AH');

-- EXPECTED: ✅ Returns UUID (allowed to discard when void)
-- If it fails, discard logic is broken ⚠️
```

### Test 2.7: Auction Bid Ordering

```sql
-- Setup: Current auction has 1C bid

-- Try to bid 1D (lower or equal level)
SELECT submit_call('test-board-1', 'bid', 1, 'diamonds') as call_id;

-- EXPECTED: ❌ ERROR: 'Bid must be higher than previous bid' or similar
-- If it succeeds, bid ordering is broken ⚠️

-- Bid 1H (higher, diamonds → hearts)
SELECT submit_call('test-board-1', 'bid', 1, 'hearts') as call_id;

-- EXPECTED: ✅ Returns UUID (valid bid)
```

### Test 2.8: Double/Redouble Validation

```sql
-- Setup: Opponent's bid is 1C, no one has doubled yet

-- Try to double without being RHO of last bidder
SELECT submit_call('test-board-1', 'double', NULL, NULL) as call_id;

-- EXPECTED: ❌ ERROR: 'Can only double opponent bid' or similar
-- If it succeeds, double validation is broken ⚠️

-- As correct RHO player
SELECT submit_call('test-board-1', 'double', NULL, NULL) as call_id;

-- EXPECTED: ✅ Returns UUID (valid double)
```

---

## Phase 3: Data Leakage Tests

### Test 3.1: game_events Payload Scan

```sql
-- Check all game_events for hand data leakage

-- Search for "hand" or "cards" arrays in payloads
SELECT 
  id,
  event_type,
  event_data::TEXT as payload_text
FROM game_events
WHERE board_id = 'test-board-1'
  AND (
    event_data::TEXT ILIKE '%"hand"%'
    OR event_data::TEXT ILIKE '%"cards"%'
    OR event_data::TEXT ILIKE '%"hand_cards"%'
  );

-- EXPECTED: ❌ 0 rows (no hand data leaked)
-- If you get rows, game_events payload is leaking cards ⚠️
```

### Test 3.2: game_events - Card Data Only in card_played

```sql
-- Check that card details only appear in 'card_played' events

SELECT 
  event_type,
  COUNT(*) as event_count,
  COUNT(CASE WHEN event_data::TEXT ILIKE '%"card"%' THEN 1 END) as with_card_key
FROM game_events
WHERE board_id = 'test-board-1'
GROUP BY event_type
ORDER BY event_type;

-- EXPECTED: 
--   - card_played: should have card_key mentions
--   - auction_call: should have 0 card_key mentions
--   - other events: should have 0 card_key mentions

-- If non-card_played events have cards, it's a leak ⚠️
```

### Test 3.3: game_events - Player Can See All in Room

```sql
-- AS AUTHENTICATED USER in room
SET SESSION AUTHORIZATION 'user_a_id';

-- Try to read all events in room
SELECT event_type, event_data 
FROM game_events 
WHERE room_id = 'test-room-1'
ORDER BY created_at;

-- EXPECTED: ✅ Can see all events
-- This is expected (events are public within room)
```

### Test 3.4: game_events - Other Room Cannot Read

```sql
-- AS USER NOT IN ROOM
SET SESSION AUTHORIZATION 'user_x_id';  -- Different room

-- Try to read events from room_1
SELECT * FROM game_events WHERE room_id = 'test-room-1';

-- EXPECTED: ❌ 0 rows (RLS blocks other rooms)
-- If you get rows, RLS is broken ⚠️
```

---

## Phase 4: Race Condition Tests

### Test 4.1: Concurrent Play Prevention

```sql
-- Terminal 1: Start transaction and lock board
BEGIN;
SELECT * FROM boards WHERE id = 'test-board-1' FOR UPDATE;

-- Terminal 2: Try to lock same board (should block)
BEGIN;
SELECT * FROM boards WHERE id = 'test-board-1' FOR UPDATE NOWAIT;

-- EXPECTED in Terminal 2: ❌ ERROR: could not obtain lock
-- If no error, locking is broken ⚠️

-- Terminal 1: Commit
COMMIT;

-- Terminal 2: Should now acquire lock (after T1 commits)
-- [Wait a moment, then lock should acquire]
-- EXPECTED: ✅ Lock acquired after T1 releases
```

### Test 4.2: RPC-Level Race Condition

```sql
-- Simulate two clients playing simultaneously

-- Client A (in real code): await supabase.rpc('play_card', {...})
-- Client B (in real code): await supabase.rpc('play_card', {...})

-- In Postgres, check play table afterward
SELECT COUNT(*) as plays_inserted FROM plays WHERE board_id = 'test-board-1';

-- EXPECTED: Depends on turn order
--   If both tried same seat: only 1 play (second rejected)
--   If different turns: 1 or 2 plays (depending on sequence)

-- Verify board state is consistent
SELECT current_turn_seat FROM boards WHERE id = 'test-board-1';

-- EXPECTED: ✅ Should be advanced correctly (no corruption)
```

---

## Phase 5: Privilege Escalation Tests

### Test 5.1: Spectator Cannot Bid

```sql
-- Setup: User X is spectator (is_spectator = true, no seat)

SET SESSION AUTHORIZATION 'user_x_id';

-- Try to submit call without seat
SELECT submit_call('test-board-1', 'bid', 1, 'clubs');

-- EXPECTED: ❌ ERROR: 'User is not seated' or similar
-- If it succeeds, spectator privilege is broken ⚠️
```

### Test 5.2: Spectator Cannot Play

```sql
-- Setup: User X is spectator, board is in play phase

SET SESSION AUTHORIZATION 'user_x_id';

SELECT play_card('test-board-1', 'AS');

-- EXPECTED: ❌ ERROR: 'User is not seated' or similar
```

### Test 5.3: Spectator CAN Read Board State

```sql
-- Setup: User X is spectator

SET SESSION AUTHORIZATION 'user_x_id';

-- Try to read public game state
SELECT id, contract, declarer_seat FROM boards WHERE id = 'test-board-1';

-- EXPECTED: ✅ 1 row (can see public board info)
-- This is correct (spectators watch the game)
```

### Test 5.4: Spectator CANNOT See Opponent Hands

```sql
-- Setup: User X is spectator

SET SESSION AUTHORIZATION 'user_x_id';

-- Try to read hands_private
SELECT * FROM hands_private WHERE board_id = 'test-board-1';

-- EXPECTED: ❌ 0 rows (RLS blocks)
-- Spectators should NOT see anyone's private hand

-- Even if dummy is revealed, spectator should see it via hands_public
SELECT * FROM hands_public WHERE board_id = 'test-board-1';

-- EXPECTED: ✅ 1 row (dummy hand, if revealed)
```

---

## Phase 6: Function Security Tests

### Test 6.1: search_path Verification

```sql
-- Check all SECURITY DEFINER functions have safe search_path

SELECT 
  proname,
  prosecdef,
  proconfig
FROM pg_proc
WHERE prosecdef = true
  AND proname IN (
    'create_room', 'join_room', 'take_seat', 'leave_seat',
    'start_match', 'start_board',
    'submit_call', 'play_card',
    'room_snapshot',
    'get_user_seat', 'deal_cards', 'get_vulnerability', 'determine_trick_winner'
  );

-- EXPECTED: All should have proconfig like:
--   {search_path=public,pg_temp}
--
-- If any are NULL or different, they're vulnerable ⚠️
```

### Test 6.2: RPC Return Data Validation

```sql
-- Check room_snapshot doesn't leak opponent hands

SET SESSION AUTHORIZATION 'user_a_id';

-- Call room_snapshot as User A
SELECT room_snapshot('test-room-1')::jsonb as snapshot;

-- Manual inspection:
--   - my_hand: Should contain User A's 13 cards ✅
--   - dummy_hand: Should contain dummy's 13 cards (if revealed) ✅
--   - opponent_hand: Should NOT exist ❌
--
-- Extract and verify no 4th hand appears
-- If you can see opponent cards, RPC is leaking ⚠️
```

---

## Phase 7: Audit & Compliance

### Test 7.1: RLS Policy Completeness

```sql
-- Verify all tables have correct policies

SELECT 
  schemaname,
  tablename,
  COUNT(*) as policy_count,
  STRING_AGG(policyname, ', ') as policy_names
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- EXPECTED: Every game table should have policies:
--   - hands_private: 1 SELECT (owner only)
--   - hands_public: 1 SELECT (room + revealed)
--   - boards: 1 SELECT (room member)
--   - auctions: 1 SELECT (room member)
--   - auction_calls: 1 SELECT (room member)
--   - tricks: 1 SELECT (room member)
--   - plays: 1 SELECT (room member)
--   - game_events: 1 SELECT (room member)
--   - room_seats, room_members: 1 SELECT (room member)
--   - rooms: 1 SELECT (true - public list)
--
-- No INSERT/UPDATE/DELETE policies (clients can't write)
```

### Test 7.2: Critical RLS: No Write Policies

```sql
-- Verify NO INSERT/UPDATE/DELETE policies exist for clients

SELECT 
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  AND tablename IN (
    'boards', 'hands_private', 'hands_public',
    'auctions', 'auction_calls', 'tricks', 'plays',
    'game_events', 'room_seats'
  );

-- EXPECTED: ❌ 0 rows (no write policies on game tables)
-- If you get rows, clients can write directly ⚠️
```

### Test 7.3: Event Log Integrity

```sql
-- Verify game_events are append-only (no deletes/updates)

-- Try to update an event
UPDATE game_events SET event_data = '{"fake": true}' 
WHERE id = 'test-event-1';

-- EXPECTED: ❌ ERROR: no update policy
-- If it succeeds, event log can be tampered ⚠️

-- Try to delete an event
DELETE FROM game_events WHERE id = 'test-event-1';

-- EXPECTED: ❌ ERROR: no delete policy
```

---

## Phase 8: Manual Application Tests

### Test 8.1: Browser Console - RLS Blocks Hand Queries

```javascript
// In browser console after joining game

// Try to read opponent hand
const { data: oppHand, error } = await supabase
  .from('hands_private')
  .select('*')
  .eq('board_id', currentBoardId)
  .eq('seat', 1);  // Opponent

console.log(oppHand);  // Should be empty [] or null
console.assert(!oppHand || oppHand.length === 0, 'LEAK: Opponent hand visible!');

// ✅ PASS if assertion succeeds
```

### Test 8.2: Browser Console - Can't Write to Board

```javascript
// Try to directly update turn

const { error } = await supabase
  .from('boards')
  .update({ current_turn_seat: 0 })
  .eq('id', currentBoardId);

console.assert(error, 'SECURITY: Direct board update should fail!');
// ✅ PASS if error exists
```

### Test 8.3: RPC Calls Work Correctly

```javascript
// Play a valid card

const { data: playId, error } = await supabase.rpc('play_card', {
  p_board_id: currentBoardId,
  p_card: 'AS'
});

console.assert(playId && !error, 'Valid play_card call failed!');
// ✅ PASS if playId is returned
```

---

## Summary Checklist

Run in order:

- [ ] **Phase 1** (5 tests): RLS enforcement
- [ ] **Phase 2** (8 tests): RPC validation
- [ ] **Phase 3** (4 tests): Data leakage
- [ ] **Phase 4** (2 tests): Race conditions
- [ ] **Phase 5** (4 tests): Privilege escalation
- [ ] **Phase 6** (2 tests): Function security
- [ ] **Phase 7** (3 tests): Audit
- [ ] **Phase 8** (3 tests): Application

**Total: 31 tests**

**Success Criteria:**
- All ✅ expectations met
- All ❌ rejections occur as expected
- No ⚠️ issues detected

**If any test fails**, that's a security issue requiring investigation.

---

## Notes for Test Execution

1. **Use pgAdmin or direct SQL client** to run SQL tests
2. **Simulate different users** with `SET SESSION AUTHORIZATION`
3. **Check error messages** to confirm rejection reason
4. **Verify game state** after each RPC (SELECT from boards/plays)
5. **Test in isolated board** (don't use production boards)

**Do NOT skip any test.** Each validates a different threat vector.
