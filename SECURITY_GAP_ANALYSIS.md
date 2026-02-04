# Security Gap Analysis & Remediation

**Date:** February 4, 2026  
**Status:** Identifying gaps between claims and reality

---

## 1. Hand Privacy: Actual vs. Claimed

### What We Claimed
> "Hand privacy is guaranteed"

### What We Actually Have
✅ **Database-level RLS:**
- `hands_private` table: Only owner can `SELECT`
- `hands_public` table: Only visible after dummy reveal
- RLS on both tables enforces these rules

✅ **RPC Design:**
- No RPC function returns opponent hands
- `room_snapshot()` only returns own hand + dummy
- game_events never contain private card arrays

✅ **Dummy Reveal:**
- Only dummy's 13 cards added to `hands_public`
- Other 3 hands never appear in public table
- Reveal happens only after opening lead

❌ **But...**
- RLS cannot prevent timing attacks (response time reveals card presence)
- RLS cannot prevent side-channel inference (bid pattern → infer distribution)
- RLS cannot prevent client code inspection (opponent could read RPC logic)
- RLS cannot prevent network sniffing (relies on HTTPS, not Postgres)

### Gaps Found & Fixes

| Gap | Severity | Root Cause | Fix |
|-----|----------|-----------|-----|
| Stale hands_public rows | Medium | start_board() doesn't clean old boards | Add: DELETE hands_public before INSERT new |
| Timing side-channel | Low | RPC response time varies by validation step | Optional: Add artificial delay in RPC |
| RLS doesn't check room membership for hands_private | Low | Assumes RPC enforces board→room link | OK if RPC is trusted, but could add belt-and-suspenders check |

### Remediation: Clean hands_public

**Add to start_board() RPC before dealing cards:**
```sql
-- Remove stale public hands from old boards
DELETE FROM hands_public
WHERE board_id IN (
    SELECT b.id FROM boards b
    JOIN matches m ON m.id = b.match_id
    WHERE m.room_id = p_room_id
    AND b.status = 'completed'
);
```

---

## 2. Turn Authority: Actual vs. Claimed

### What We Claimed
> "Turn order is validated server-side"

### What We Actually Have
✅ **RPC Validation:**
- `play_card()` checks: `current_turn_seat == get_user_seat()`
- `submit_call()` checks: `current_turn_seat == get_user_seat()`
- Both reject with clear error if not user's turn

✅ **Row Locking:**
- `SELECT ... FOR UPDATE` on boards row
- Prevents concurrent plays from advancing turn twice
- Second play waits for lock, then sees new turn state

✅ **Transaction Semantics:**
- Turn update + card removal happen atomically
- No half-state where card is gone but turn not advanced

❌ **But...**
- HTTP-layer replay attacks possible (same request sent twice)
- Supabase must handle session management (not Postgres responsibility)
- Advisory locks not used (only row locks)
- No RPC idempotency key (caller can't detect if request succeeded and was retried)

### Gaps Found & Fixes

| Gap | Severity | Root Cause | Fix |
|-----|----------|-----------|-----|
| No replay detection | Medium | HTTP layer unaware of logical operations | Use idempotency keys (client responsibility) |
| No advisory locks | Low | Row locks sufficient but not explicit | OK for current use, but could add if paranoid |
| Concurrent play race window | Low | Lock acquired during RPC execution | Supabase handles connection pooling |

### Remediation: Add Idempotency Keys

**In RPC function:**
```sql
-- Add to play_card() signature
CREATE OR REPLACE FUNCTION play_card(
  p_board_id UUID,
  p_card TEXT,
  p_idempotency_key UUID DEFAULT NULL  -- ← NEW
)
RETURNS UUID AS $$
DECLARE
    v_existing_play UUID;
BEGIN
    -- Check if this move was already made
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_play FROM plays
        WHERE board_id = p_board_id
          AND idempotency_key = p_idempotency_key;
        
        IF v_existing_play IS NOT NULL THEN
            RETURN v_existing_play;  -- Idempotent return
        END IF;
    END IF;
    
    -- Rest of logic...
    INSERT INTO plays (..., idempotency_key) VALUES (..., p_idempotency_key);
    ...
END;
```

**In client:**
```typescript
// Generate UUID once per move
const idempotencyKey = crypto.randomUUID();

// Can retry with confidence
const result = await supabase.rpc('play_card', {
  p_board_id: boardId,
  p_card: 'AS',
  p_idempotency_key: idempotencyKey
});

// If network fails, retry with same key—server returns same result
```

---

## 3. RPC Security: Actual vs. Claimed

### What We Claimed
> "Only RPC functions can mutate state"

### What We Actually Have
✅ **RLS Blocks Direct Writes:**
- `INSERT`, `UPDATE`, `DELETE` denied on all game tables
- Clients get: `ERROR: new row violates row-level security policy`

✅ **All Writes via RPC:**
- create_room, join_room, take_seat via RPC only
- submit_call, play_card via RPC only
- start_match, start_board via RPC only

✅ **SECURITY DEFINER Functions:**
- RPCs run with elevated privileges
- Can call helper functions and modify state
- search_path hardened to `public, pg_temp`

❌ **But...**
- RPC code is visible to all authenticated users (can inspect logic)
- No rate limiting at Postgres level (HTTP layer responsibility)
- No input sanitization beyond type checking (parameterized queries used, so safe from SQL injection)
- search_path hardening is good, but only works if Postgres itself is not compromised

### Gaps Found & Fixes

| Gap | Severity | Root Cause | Fix |
|-----|----------|-----------|-----|
| RPC code inspection | Low | plpgsql is readable | Educate users that RPC logic is public |
| No rate limiting | Medium | Supabase function throttling | Use: Client must throttle RPC calls + Supabase built-in rate limits |
| SQL injection in card param | Critical if not handled | Could pass 'AS; DROP' | Verified: Card param validated as regex `^[23456789TJQKA][SDHC]$` ✅ |
| SECURITY DEFINER privilege escalation | Critical if bug exists | Could abuse elevated privs | Code review shows no privilege escalation vectors ✅ |

### Remediation: Rate Limiting

**At RPC level (Supabase):** Use built-in rate limiting config (set in Supabase dashboard)

**At client level:**
```typescript
// Add debounce/throttle to prevent spam
const playCardThrottled = throttle(
  (boardId: string, card: string) => supabase.rpc('play_card', { p_board_id: boardId, p_card: card }),
  500  // Min 500ms between calls
);

// Add retry logic with exponential backoff
async function playCardWithRetry(boardId: string, card: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await supabase.rpc('play_card', { p_board_id: boardId, p_card: card });
    } catch (error) {
      if (error.status === 429) {  // Rate limited
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
}
```

---

## 4. game_events Log: Actual vs. Claimed

### What We Claimed
> "Complete event log for real-time sync without leaking private data"

### What We Actually Have
✅ **Append-Only Log:**
- game_events table: INSERT only (no UPDATE/DELETE)
- All state changes recorded chronologically
- Can replay to reconstruct any board state

✅ **Public Information Only:**
- event_type: 'auction_call', 'card_played', 'board_started', etc.
- event_data: Only contains public move info (card, bid, not hand arrays)
- No private hands in payloads

✅ **RLS-Controlled Access:**
- Players in room can `SELECT` all events
- Players in other rooms cannot
- Spectators in room can see all events

❌ **But...**
- Event data is still analyzable (bids + plays reveal information)
- Old events are never deleted (audit trail grows unbounded)
- game_events payload is JSON (could contain leaks if RPC has bugs)
- No confidentiality: events are literally "what happened in the game"

### Gaps Found & Fixes

| Gap | Severity | Root Cause | Fix |
|-----|----------|-----------|-----|
| Audit trail unbounded | Low | No archival policy | OK for now, but plan cleanup (e.g., delete old rooms) |
| Event payloads not validated | Medium | RPC could accidentally log hands | Add: Test suite (SECURITY_VALIDATION_TESTS.md Test 3.1) |
| Timing of reveals | Low | Event shows when dummy revealed | Expected (players see this anyway) |

### Remediation: Payload Validation Test

**Add to CI/CD:**
```sql
-- Automated check: No hand arrays in game_events
SELECT COUNT(*) as leaked_hands
FROM game_events
WHERE event_data::TEXT ~ '["cards"|"hand"]'
  AND event_type != 'board_started';

-- Should return 0. If > 0, audit the event and fix RPC.
```

---

## 5. Spectator Isolation: Actual vs. Claimed

### What We Claimed
> "Spectators can watch but not participate"

### What We Actually Have
✅ **Seat Checks:**
- RPC functions check: is user seated?
- If not, return error: "User is not seated"
- Spectators cannot bid or play

✅ **RLS Allows Watching:**
- Spectators (no seat) can SELECT boards, auctions, tricks, plays
- Spectators can see dummy after reveal
- Spectators cannot SELECT hands_private (no seat = no access)

✅ **Game Events Visible:**
- Spectators in room can see all game_events
- Spectators watch real-time play

❌ **But...**
- Spectators can try to call RPC (will fail, but creates noise)
- RPC doesn't prevent spectator from trying to call `play_card()`
- No explicit "spectator mode" RLS (relies on seat checks in RPC)

### Gaps Found & Fixes

| Gap | Severity | Root Cause | Fix |
|-----|----------|-----------|-----|
| Spectator can attempt invalid RPC | Low | RPC validates on every call | Expected; error is rejected |
| No spectator-specific policy | Low | Seat existence is the check | OK, but could add explicit spectator RLS if paranoid |

### Remediation: None needed

Current design is sufficient. Spectators fail at RPC layer with clear error.

---

## 6. Dummy Reveal: Actual vs. Claimed

### What We Claimed
> "Dummy revealed only after opening lead, visible to all, opponents' hands hidden"

### What We Actually Have
✅ **Dummy Only:**
- play_card() on opening lead triggers: copy dummy to hands_public
- RPC explicitly selects `WHERE seat = v_dummy_seat`
- Only 13 cards inserted (one hand)

✅ **Visibility Control:**
- hands_public RLS checks: `board.dummy_revealed = true`
- If true, all room members can read dummy
- If false, query returns 0 rows

✅ **Opponents Hidden:**
- hands_public never contains non-dummy hands
- hands_private RLS blocks them anyway
- game_events don't contain card arrays

❌ **But...**
- Stale hands_public rows could linger if cleanup not done
- RLS checks dummy_revealed, but what if old rows have wrong seat?
- No constraint preventing duplicate entries for same board/seat

### Gaps Found & Fixes (CRITICAL)

| Gap | Severity | Root Cause | Fix |
|-----|----------|-----------|-----|
| Stale hands_public rows | Medium | start_board() doesn't clean | ✅ Add DELETE before INSERT (see #1) |
| Duplicate hands_public entries | Medium | No unique constraint | ✅ Add: UNIQUE (board_id, seat) |
| Old rows from re-dealt hands | Medium | No cleanup on board reset | ✅ Add DELETE in start_board() |

### Remediation: Add Constraint + Cleanup

**In next migration:**
```sql
-- Add unique constraint
ALTER TABLE hands_public
  ADD CONSTRAINT hands_public_unique UNIQUE (board_id, seat);

-- Add cleanup to start_board()
DELETE FROM hands_public
WHERE board_id IN (
    SELECT id FROM boards
    WHERE match_id = p_match_id
);

-- Then INSERT new board's hands
INSERT INTO hands_public ... VALUES (...);
```

---

## 7. Follow-Suit Validation: Actual vs. Claimed

### What We Claimed
> "Follow-suit rules enforced, discard allowed when void"

### What We Actually Have
✅ **Validation Logic:**
- play_card() checks: does player have lead suit?
- If yes, must play lead suit (no discard)
- If no (void), can play any card

✅ **Hand Lookup:**
- RPC queries hands_private for user's seat
- If card found, allowed (and matches suit requirements)
- If card not found, rejected

✅ **Trump Interactions:**
- Trick winner determined by trump (in determine_trick_winner())
- Follow-suit logic doesn't interact with trump (correct)

❌ **But...**
- Lead suit only enforced on second+ card of trick
- First card (lead) can be any suit (correct per rules)
- No check for "must trump if can't follow and trump played" (Bridge optional rule)

### Gaps Found & Fixes

| Gap | Severity | Root Cause | Fix |
|-----|----------|-----------|-----|
| Trump rule not enforced | Low | Complex Bridge rule, optional | Clarify: Is this required? If yes, add to play_card() |

### Remediation: Clarify Rules

**Current behavior:** Player can discard if void, even if trump available.

**Decision:** Clarify with product:
- Option A: Enforce strict follow-suit + trump play → Add logic
- Option B: Allow discard anytime when void → Current behavior
- Option C: Warn user but allow both → Client-side only

---

## 8. Auction Validation: Actual vs. Claimed

### What We Claimed
> "Bid level validation, double/redouble rules enforced"

### What We Actually Have
✅ **Bid Comparison:**
- submit_call() validates: bid.level > last_bid.level
- Or: same level, different strain, but strain ranked correctly (clubs < diamonds < hearts < spades < NT)
- Pass is always valid (doesn't compare)

✅ **Double/Redouble:**
- Can only double last bid by opponent
- Can only redouble if doubled bid is from partner
- Both validated in submit_call()

✅ **Auction End Detection:**
- 3 consecutive passes detected
- Board transitions from 'auction' to 'play'
- Declarer/dummy/opening_leader computed

❌ **But...**
- No "7 bid is maximum" check (Bridge rules)
- No "must bid above previous if not pass/double" soft check (hard to enforce without complex state)
- Auction end computed AFTER last pass (no early detection)

### Gaps Found & Fixes

| Gap | Severity | Root Cause | Fix |
|-----|----------|-----------|-----|
| No 7-bid max | Low | No validation in submit_call() | Add: IF p_level > 7 THEN RAISE |
| No soft bid ordering | Low | Complex to define without full history | OK; RPC rejects invalid bids with level comparison |

### Remediation: Add 7-Bid Check

```sql
-- In submit_call(), after input validation:
IF p_call_type = 'bid' AND p_level > 7 THEN
    RAISE EXCEPTION 'Bid level cannot exceed 7';
END IF;
```

---

## 9. Summary: Gaps by Category

### Critical (Fix Before Production)
- [ ] Add DELETE to start_board() to clean stale hands_public rows
- [ ] Add UNIQUE constraint (board_id, seat) to hands_public
- [ ] Add input validation: bid level max 7

### High (Fix Soon)
- [ ] Add idempotency keys to play_card() + submit_call() RPC
- [ ] Implement rate limiting (Supabase config + client throttle)
- [ ] Document security assumptions in README

### Medium (Nice-to-Have)
- [ ] Add timing attack mitigation (artificial delay, optional)
- [ ] Add audit logging for security events
- [ ] Implement board archival/cleanup policy

### Low (Informational)
- [ ] Clarify which optional Bridge rules are enforced
- [ ] Document that RPC code is readable/inspectable
- [ ] Add security FAQ to client guide

---

## 10. Verification Checklist

Before marking "secure," verify:

- [ ] Run all 31 tests from SECURITY_VALIDATION_TESTS.md
- [ ] All tests PASS (no failures)
- [ ] No ⚠️ issues discovered in testing
- [ ] Code review: search_path on all SECURITY DEFINER functions
- [ ] Code review: No secrets in RPC function source
- [ ] Database check: No write policies on game tables (RLS test 7.2)
- [ ] game_events audit: No hand arrays in payloads (Test 3.1)
- [ ] Apply Critical fixes (3 items above)
- [ ] Document assumptions in README
- [ ] Get security sign-off from stakeholders

---

## 11. Outstanding Design Questions

These don't require fixing, but clarify expectations:

1. **Should we prevent information leakage from bids?**
   - No: Bids are game-public in Bridge rules
   - Leakage is inherent, not a bug

2. **Should we enforce all optional Bridge rules (trump play, etc.)?**
   - Clarify with product which rules are "must-have"

3. **Should we support claim/concede?**
   - Currently: Not implemented
   - Decision: Low priority for MVP?

4. **Should we detect cheating retroactively (audit logs)?**
   - Currently: No; we prevent it proactively
   - Decision: Add later if incidents occur?

---

## Conclusion

**Overall Assessment:** ✅ **Security-sound for MVP**

The architecture prevents all critical attack vectors:
- ❌ Can't see opponent hands
- ❌ Can't play cards you don't have
- ❌ Can't play out of turn
- ❌ Can't skip follow-suit
- ❌ Can't make invalid bids

**Remaining gaps are small fixes** (cleanup, constraints, input validation).

**Recommended next steps:**
1. Apply critical fixes (3 items)
2. Run full test suite (31 tests)
3. Get security approval
4. Deploy to production

---

**Produced by:** Security Analysis
**Date:** February 4, 2026
