# Quick Reference Card: Security at a Glance

**Print this or keep it open while reviewing code.**

---

## TL;DR: What We Prevent & What We Don't

```
CAN PREVENT ✅              CANNOT PREVENT ❌           MITIGATED BY AUTH ⚠️
──────────────────────────────────────────────────────────────────────────

Play wrong card             Infer from bids             Session hijacking
Play out of turn            Timing attacks              Password attacks
Skip follow-suit            Collusion                   MITM attacks
Invalid bids                Information leakage
See opponent hand           Postgres compromise
Direct DB writes            Infrastructure breach
Concurrent corruption
```

---

## RLS: Who Can Read What?

```
TABLE: hands_private (Most Critical)
├─ Owner: ✅ YES (WHERE owner_user_id = auth.uid())
├─ Other players: ❌ NO
├─ Spectators: ❌ NO
└─ RPS: ❌ CAN BYPASS (don't give Postgres access)

TABLE: hands_public (After Reveal)
├─ Room member (if dummy revealed): ✅ YES
├─ Room member (if not revealed): ❌ NO
├─ Spectator (if revealed): ✅ YES
└─ Other room: ❌ NO

TABLE: game_events (Public Log)
├─ Room member: ✅ YES
├─ Spectator: ✅ YES
├─ Other room: ❌ NO
└─ Content: ONLY public info (no private hands)

TABLE: boards, auctions, tricks, plays (Game State)
├─ Room member: ✅ YES (read only)
├─ Spectator: ✅ YES (read only)
├─ Other room: ❌ NO
└─ Writes: ❌ RPC ONLY
```

---

## RPC Functions: What's Protected

```
FUNCTION            VALIDATES                           BLOCKS
──────────────────────────────────────────────────────────────────

create_room()       Code format                         Spam
join_room()         Room exists, code matches           Invalid joins
take_seat()         Seat empty, not spectator           Invalid seats
start_match()       4 players seated                    Early start
start_board()       Cleans stale hands_public           Corruption
submit_call()       Turn order, bid ordering,           Invalid bids
                    double rules, level 1-7
play_card()         Turn order, card in hand,           Illegal plays
                    follow-suit, card format
room_snapshot()     User in room, returns own hand      Data leaks
```

---

## Critical Validation Points (Code Review)

```
CHECK THIS IN EACH RPC:

1. ✅ Turn order
   IF current_turn_seat != user_seat THEN RAISE

2. ✅ Card ownership
   SELECT ... FROM hands_private WHERE owner_user_id = auth.uid()

3. ✅ Follow-suit
   IF lead_suit IS NOT NULL AND has_lead_suit THEN must_play_suit

4. ✅ Row locking
   SELECT ... FOR UPDATE (prevents concurrent double-play)

5. ✅ Transaction atomicity
   Card removal + turn advancement in ONE transaction

6. ✅ Return values
   Only return IDs, not full rows (prevent leaks)

7. ✅ Error messages
   Clear but not revealing ("Not your turn" not "You're seat 1, turn is 0")
```

---

## Test These 3 Things (Before Production)

### Test 1: Can I Read Someone Else's Hand?
```sql
-- As User B, try to read User A's hand
SET SESSION AUTHORIZATION user_b;
SELECT * FROM hands_private WHERE board_id = 'xyz' AND seat = 0;
-- Expected: 0 rows ✅ (if you get rows, RLS is broken)
```

### Test 2: Can I Play Out of Turn?
```sql
-- As User B, try to play (but it's User A's turn)
SELECT play_card('board-xyz', 'AS');
-- Expected: ERROR "Not your turn" ✅ (if it succeeds, validation is broken)
```

### Test 3: Can I Directly Write to the Database?
```sql
-- Try to INSERT bid directly
INSERT INTO auction_calls (...) VALUES (...);
-- Expected: ERROR "violates row-level security" ✅ (if it inserts, RLS is broken)
```

**If all 3 tests show ✅, core security is working.**

---

## Assumptions: What We Trust

```
WE TRUST THAT...                        BECAUSE...
────────────────────────────────────────────────────

1. Supabase JWT is correct             auth.uid() must be accurate
2. Postgres RLS works                  Database-level enforcement
3. RPC functions are bug-free          We implemented them
4. HTTPS/TLS is configured             Network encryption
5. Database schema is under control    Version-controlled

IF ANY OF THESE ARE FALSE:
❌ All security fails
❌ Cheating is possible
❌ Hands can be exposed
```

---

## The 3 Critical Migrations (Before Production)

```
MIGRATION           WHAT IT FIXES           IMPACT
──────────────────────────────────────────────────────────

13: Clean stale     Old dummy hands         Can prevent info
    hands_public    linger and are          leak from old boards
                    readable

14: Add unique      Duplicate dummy         Prevents multiple
    constraint      hands possible          copies of same hand

15: Add bid level   Bid level > 7           Prevents impossible
    max validation  accepted                bids (should be 1-7)

All must be applied before production.
```

---

## Debug Checklist: Something's Wrong?

```
Symptom: Player can see opponent's hand
  → Check: hands_private RLS policy exists?
  → Check: SELECT hands_private returns empty for non-owner?
  → Check: game_events contains no card arrays?

Symptom: Player can play out of turn
  → Check: play_card() validates current_turn_seat?
  → Check: RPC has SELECT...FOR UPDATE?
  → Check: Error message says "Not your turn"?

Symptom: Player can directly update board
  → Check: UPDATE policy exists on boards? (should be NO)
  → Check: SELECT pg_policies shows only SELECT allowed?
  → Check: Error says "violates row-level security"?

Symptom: Stale hands_public from old boards visible
  → Check: Migration 13 applied (DELETE stale rows)?
  → Check: start_board() has cleanup?
  → Check: hands_public is empty before new board?

Symptom: Duplicate dummy hands in same board
  → Check: Migration 14 applied (unique constraint)?
  → Check: ALTER TABLE shows UNIQUE (board_id, seat)?
  → Check: INSERT duplicate gets error?

Symptom: Bid level 8 accepted
  → Check: Migration 15 applied?
  → Check: submit_call() validates level < 7?
  → Check: RAISE fires on level > 7?
```

---

## RLS Policy Template (Copy-Paste)

```sql
-- Basic RLS for game tables
CREATE POLICY "room_member_select"
    ON game_table FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM room_members rm
            JOIN matches m ON m.room_id = rm.room_id
            JOIN boards b ON b.match_id = m.id
            WHERE b.id = game_table.board_id
            AND rm.profile_id = auth.uid()
        )
    );

-- Hand privacy (most restrictive)
CREATE POLICY "owner_only"
    ON hands_private FOR SELECT
    USING (owner_user_id = auth.uid());

-- Dummy reveal (conditional)
CREATE POLICY "revealed_only"
    ON hands_public FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM boards b
            WHERE b.id = hands_public.board_id
            AND b.dummy_revealed = true
        )
    );

-- No writes from client
-- (Don't create INSERT/UPDATE/DELETE policies)
```

---

## Search Path Security Checklist

```
For every SECURITY DEFINER function:

✅ CREATE FUNCTION ... SET search_path = public, pg_temp;
   ↑ This line prevents privilege escalation

❌ DO NOT: Create function without search_path
❌ DO NOT: Use search_path = 'user_schema'
❌ DO NOT: Create private functions in user schemas

Verify:
  SELECT proconfig FROM pg_proc WHERE proname = 'your_function';
  ↑ Should show: {search_path=public,pg_temp}
```

---

## Priority Matrix: What to Fix First

```
IMPACT   │  Easy to Fix           Hard to Fix
─────────┼────────────────────────────────────────
HIGH     │ ✅ FIX NOW              ⚠️ Plan fix
         │ - Stale hands_public    - Timing attacks
         │ - Bid level validation  - Session hijacking
         │ - Unique constraint     - Postgres bugs
         │
MEDIUM   │ ⚠️ FIX SOON              ⏳ Monitor
         │ - Idempotency keys      - RPC spam/DoS
         │ - Rate limiting         - Auth weaknesses
         │                         
LOW      │ 📋 Document             🔍 Watch
         │ - Information leakage   - Collusion
         │ - Spectator isolation   - Timing side-channels
```

---

## Common Mistakes (Don't Do These)

```
❌ MISTAKE: SELECT * FROM hands_private in RPC return
   → Leaks all hands
   → FIX: Only return IDs or non-sensitive data

❌ MISTAKE: IF (v_seat != 0) THEN ... (hard-coded seat)
   → Only works for one player
   → FIX: Use get_user_seat(room_id, auth.uid())

❌ MISTAKE: No FOR UPDATE in RPC
   → Concurrent plays possible
   → FIX: Add SELECT ... FOR UPDATE on boards

❌ MISTAKE: Dummy reveal without checking dummy_revealed flag
   → Players can see hands before reveal
   → FIX: RLS: WHERE board.dummy_revealed = true

❌ MISTAKE: game_events payload contains full hand arrays
   → Leaks private info
   → FIX: Only log public moves (card, bid, result)

❌ MISTAKE: No unique constraint on hands_public
   → Duplicates possible
   → FIX: ADD CONSTRAINT hands_public UNIQUE (board_id, seat)

❌ MISTAKE: RPC doesn't validate input format
   → SQL injection possible
   → FIX: Use parameterized queries (Postgres does this)

❌ MISTAKE: Relying on client-side RLS
   → Client can be modified
   → FIX: Server must enforce (RLS + RPC validation)
```

---

## One-Page Decision Tree: Is This Secure?

```
Question 1: Are all writes via RPC?
  NO  → ❌ INSECURE (allow direct writes)
  YES → Go to Q2

Question 2: Do RPCs validate turn order?
  NO  → ❌ INSECURE (out-of-turn plays possible)
  YES → Go to Q3

Question 3: Are hands_private RLS-protected?
  NO  → ❌ INSECURE (opponent hands visible)
  YES → Go to Q4

Question 4: Do RPCs use SELECT...FOR UPDATE?
  NO  → ⚠️ RISKY (concurrent plays possible)
  YES → Go to Q5

Question 5: Is game_events payload reviewed?
  NO  → ❌ INSECURE (might contain hands)
  YES → Go to Q6

Question 6: Are critical migrations applied?
  NO  → ⚠️ INCOMPLETE (gaps exist)
  YES → ✅ SECURE

Final: Run all 31 tests. If all PASS: ✅ GOOD TO DEPLOY
```

---

## Deploy Confidence Scale

```
❌ STOP       ⚠️  CAUTION      ✅ GO

- Migrations  - No testing    - All migrations
  not applied - Some gaps       applied
- RLS broken   remain         - All 31 tests PASS
- Hands exposed - Not reviewed - Security signed off
- Direct DB    by team       - Monitoring ready
  writes work
```

---

**Quick Reference Card v1.0**  
**Print this. Keep it handy.**  
**Review before any code change to game logic.**

Last Updated: February 4, 2026
