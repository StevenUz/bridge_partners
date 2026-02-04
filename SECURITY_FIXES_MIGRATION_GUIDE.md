# Critical Security Fixes: Migration Guide

**Apply these migrations before production deployment.**

---

## Overview

Based on the security analysis, 3 critical issues were identified:

| Issue | Migration | Priority |
|-------|-----------|----------|
| Stale hands_public rows | 13_fix_hands_public_cleanup | **CRITICAL** |
| No unique constraint on dummy | 14_add_hands_public_unique | **CRITICAL** |
| No bid level validation | 15_add_bid_level_max | **CRITICAL** |

---

## Migration 13: Fix hands_public Cleanup

**Purpose:** Prevent stale rows from previous boards from being readable

**Before:** start_board() deals cards but doesn't clean old hands_public rows

**After:** start_board() deletes stale hands_public before dealing new ones

**Migration:**
```sql
-- Migration: 13_fix_hands_public_cleanup
-- Purpose: Add cleanup to start_board RPC to prevent stale hands_public rows
-- Status: CRITICAL - prevents dummy reveal information leakage

-- Step 1: Update start_board() function to include cleanup
CREATE OR REPLACE FUNCTION start_board(p_match_id UUID)
RETURNS UUID AS $$
DECLARE
    v_room_id UUID;
    v_board_id UUID;
    v_match boards.match_id%TYPE;
    v_board_number boards.board_number%TYPE;
    v_board_count INT;
    v_dealer_seat INT;
    v_vulnerability vulnerability;
    v_dealt_hands JSONB[];
    v_hand_idx INT := 0;
    v_cards TEXT[];
BEGIN
    -- Get room_id from match
    SELECT m.room_id INTO v_room_id FROM matches m WHERE m.id = p_match_id;
    
    IF v_room_id IS NULL THEN
        RAISE EXCEPTION 'Match not found';
    END IF;
    
    -- Get board number
    SELECT COUNT(*) + 1 INTO v_board_count FROM boards WHERE match_id = p_match_id;
    v_board_number := v_board_count;
    
    -- Calculate dealer (rotates: South=0, West=1, North=2, East=3)
    v_dealer_seat := (v_board_number - 1) % 4;
    
    -- Get vulnerability
    v_vulnerability := get_vulnerability(v_board_number);
    
    -- Clean up stale hands_public rows from previous boards ← NEW
    DELETE FROM hands_public
    WHERE board_id IN (
        SELECT id FROM boards
        WHERE match_id = p_match_id
    );
    
    -- Create new board
    INSERT INTO boards (match_id, board_number, dealer_seat, vulnerability, status, current_turn_seat)
    VALUES (p_match_id, v_board_number, v_dealer_seat, v_vulnerability, 'auction', v_dealer_seat)
    RETURNING id INTO v_board_id;
    
    -- Deal cards (Fisher-Yates shuffle)
    v_dealt_hands := deal_cards();
    
    -- Distribute cards to hands_private for all 4 seats
    FOR v_hand_idx IN 0..3 LOOP
        INSERT INTO hands_private (board_id, seat, owner_user_id, cards)
        SELECT 
            v_board_id,
            v_hand_idx,
            rs.profile_id,
            v_dealt_hands[v_hand_idx + 1]
        FROM room_seats rs
        WHERE rs.room_id = v_room_id AND rs.seat = v_hand_idx
        AND rs.profile_id IS NOT NULL;  -- Only insert if seat is occupied
    END LOOP;
    
    -- Create auction record
    INSERT INTO auctions (board_id, status, current_turn_seat)
    VALUES (v_board_id, 'in_progress', v_dealer_seat);
    
    RETURN v_board_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Step 2: Verify function compiles and has correct search_path
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE proname = 'start_board' AND prosecdef = true;

-- Expected: prosecdef = true, proconfig = '{search_path=public,pg_temp}'
```

---

## Migration 14: Add Unique Constraint on hands_public

**Purpose:** Prevent multiple rows for same board/seat combination

**Before:** hands_public can have duplicates (board_id, seat)

**After:** UNIQUE constraint prevents duplicates

**Migration:**
```sql
-- Migration: 14_add_hands_public_unique
-- Purpose: Add unique constraint to prevent duplicate dummy hands
-- Status: CRITICAL - ensures only one set of dummy cards per board

-- Step 1: Check for existing duplicates (cleanup if any exist)
SELECT board_id, seat, COUNT(*) as duplicate_count
FROM hands_public
GROUP BY board_id, seat
HAVING COUNT(*) > 1;

-- If any duplicates found, DELETE older ones:
DELETE FROM hands_public hp1
WHERE ctid NOT IN (
    SELECT ctid FROM hands_public hp2
    WHERE hp2.board_id = hp1.board_id
    AND hp2.seat = hp1.seat
    ORDER BY hp2.created_at DESC
    LIMIT 1
);

-- Step 2: Add unique constraint
ALTER TABLE hands_public
ADD CONSTRAINT hands_public_unique_board_seat
UNIQUE (board_id, seat);

-- Step 3: Verify constraint exists
SELECT constraint_name, constraint_type
FROM information_schema.constraints
WHERE table_name = 'hands_public'
AND constraint_name = 'hands_public_unique_board_seat';

-- Expected: 1 row with constraint_type = 'UNIQUE'
```

---

## Migration 15: Add Bid Level Max Validation

**Purpose:** Enforce Bridge rule: bid level cannot exceed 7

**Before:** submit_call() accepts bid level > 7

**After:** submit_call() rejects bids with level > 7

**Migration:**
```sql
-- Migration: 15_add_bid_level_max
-- Purpose: Validate bid level max 7 per Bridge rules
-- Status: CRITICAL - prevents invalid high bids

-- Step 1: Update submit_call() function
CREATE OR REPLACE FUNCTION submit_call(
    p_board_id UUID,
    p_call_type call_type,
    p_level INT DEFAULT NULL,
    p_strain strain DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_user_seat INT;
    v_room_id UUID;
    v_auction auction%ROWTYPE;
    v_board boards%ROWTYPE;
    v_last_call auction_calls%ROWTYPE;
    v_call_id UUID;
    v_auction_id UUID;
    v_sequence INT;
BEGIN
    -- Get room_id and validate user is seated
    SELECT m.room_id, b.id INTO v_room_id, v_board_id
    FROM boards b
    JOIN matches m ON m.id = b.match_id
    WHERE b.id = p_board_id;
    
    IF v_room_id IS NULL THEN
        RAISE EXCEPTION 'Board not found';
    END IF;
    
    v_user_seat := get_user_seat(v_room_id, auth.uid());
    
    IF v_user_seat IS NULL THEN
        RAISE EXCEPTION 'User is not seated in this room';
    END IF;
    
    -- Get auction and board info
    SELECT * INTO v_auction FROM auctions WHERE board_id = p_board_id;
    SELECT * INTO v_board FROM boards WHERE id = p_board_id;
    
    -- Check if auction is still in progress
    IF v_board.status != 'auction' THEN
        RAISE EXCEPTION 'Auction is not in progress';
    END IF;
    
    -- Check if it's user's turn
    IF v_board.current_turn_seat != v_user_seat THEN
        RAISE EXCEPTION 'Not your turn';
    END IF;
    
    -- ← NEW VALIDATION: Bid level max 7
    IF p_call_type = 'bid' THEN
        IF p_level IS NULL OR p_strain IS NULL THEN
            RAISE EXCEPTION 'Bid must have level and strain';
        END IF;
        
        IF p_level < 1 OR p_level > 7 THEN  -- ← NEW CHECK
            RAISE EXCEPTION 'Bid level must be between 1 and 7';
        END IF;
        
        -- Get last bid
        SELECT * INTO v_last_call FROM auction_calls
        WHERE auction_id = v_auction.id
        ORDER BY sequence DESC
        LIMIT 1;
        
        -- Validate bid is higher than previous
        IF v_last_call.call_type = 'bid' THEN
            IF p_level < v_last_call.level THEN
                RAISE EXCEPTION 'Bid must be higher than previous bid';
            ELSIF p_level = v_last_call.level THEN
                -- Same level, check strain rank
                IF NOT (get_strain_rank(p_strain) > get_strain_rank(v_last_call.strain)) THEN
                    RAISE EXCEPTION 'Bid must be higher than previous bid';
                END IF;
            END IF;
        END IF;
    END IF;
    
    -- Rest of function (unchanged)...
    -- [INSERT call, check for 3-pass auction end, etc.]
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Step 2: Verify function compiles
SELECT proname FROM pg_proc WHERE proname = 'submit_call' AND prosecdef = true;

-- Expected: 1 row (function exists and is SECURITY DEFINER)
```

---

## Migration 16: Add Idempotency Keys (Optional but Recommended)

**Purpose:** Prevent duplicate effects from HTTP request retries

**Before:** Client cannot safely retry RPC without risk of double-play

**After:** RPC with idempotency key prevents double execution

**Migration:**
```sql
-- Migration: 16_add_idempotency_keys
-- Purpose: Support idempotent RPC calls for retry safety
-- Status: RECOMMENDED (not critical, but improves reliability)

-- Step 1: Add idempotency_key columns to plays and auction_calls
ALTER TABLE plays
ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

ALTER TABLE auction_calls
ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

-- Step 2: Update play_card() to accept idempotency_key
CREATE OR REPLACE FUNCTION play_card(
    p_board_id UUID,
    p_card TEXT,
    p_idempotency_key UUID DEFAULT NULL  -- ← NEW
)
RETURNS UUID AS $$
DECLARE
    v_existing_play_id UUID;
    v_user_seat INT;
    v_room_id UUID;
    v_board boards%ROWTYPE;
    v_play_id UUID;
BEGIN
    -- Check for existing play with same idempotency key
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_play_id FROM plays
        WHERE board_id = p_board_id
        AND idempotency_key = p_idempotency_key;
        
        IF v_existing_play_id IS NOT NULL THEN
            RETURN v_existing_play_id;  -- Idempotent: return existing
        END IF;
    END IF;
    
    -- Get room and validate user
    SELECT m.room_id, b.* INTO v_room_id, v_board
    FROM boards b
    JOIN matches m ON m.id = b.match_id
    WHERE b.id = p_board_id
    FOR UPDATE OF b;
    
    v_user_seat := get_user_seat(v_room_id, auth.uid());
    
    IF v_user_seat IS NULL THEN
        RAISE EXCEPTION 'User is not seated';
    END IF;
    
    -- Rest of validation (unchanged)...
    -- [turn check, hand check, follow-suit check, etc.]
    
    -- INSERT play with idempotency key
    INSERT INTO plays (board_id, trick_id, sequence, seat, card, idempotency_key)
    VALUES (p_board_id, v_current_trick_id, v_play_seq, v_user_seat, p_card, p_idempotency_key)
    RETURNING id INTO v_play_id;
    
    -- Rest of function (unchanged)...
    
    RETURN v_play_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Step 3: Update submit_call() similarly
CREATE OR REPLACE FUNCTION submit_call(
    p_board_id UUID,
    p_call_type call_type,
    p_level INT DEFAULT NULL,
    p_strain strain DEFAULT NULL,
    p_idempotency_key UUID DEFAULT NULL  -- ← NEW
)
RETURNS UUID AS $$
DECLARE
    v_existing_call_id UUID;
BEGIN
    -- Check for existing call with same idempotency key
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_call_id FROM auction_calls
        WHERE board_id = p_board_id
        AND idempotency_key = p_idempotency_key;
        
        IF v_existing_call_id IS NOT NULL THEN
            RETURN v_existing_call_id;  -- Idempotent: return existing
        END IF;
    END IF;
    
    -- Rest of function (unchanged)...
    -- [validation, INSERT with idempotency_key]
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
```

---

## Migration 17: Add Rate Limiting via Advisory Locks (Optional)

**Purpose:** Prevent RPC spam from single user

**Before:** No server-side rate limiting (relies on Supabase config)

**After:** RPC uses advisory locks for per-user rate limiting

**Migration:**
```sql
-- Migration: 17_add_rpc_rate_limiting
-- Purpose: Optional rate limiting for RPC calls
-- Status: OPTIONAL (Supabase should handle this, but belt-and-suspenders approach)

-- Step 1: Create helper function
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_user_id UUID,
    p_call_name TEXT,
    p_max_per_minute INT DEFAULT 10
)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INT;
    v_minute_ago TIMESTAMP;
BEGIN
    v_minute_ago := NOW() - INTERVAL '1 minute';
    
    -- Count calls in last minute
    SELECT COUNT(*) INTO v_count FROM game_events
    WHERE created_by = p_user_id
    AND event_type = p_call_name
    AND created_at > v_minute_ago;
    
    IF v_count >= p_max_per_minute THEN
        RETURN FALSE;  -- Rate limited
    END IF;
    
    RETURN TRUE;  -- OK
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Step 2: Use in play_card() (example)
-- Add to start of function:
IF NOT check_rate_limit(auth.uid(), 'card_played', 30) THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum 30 plays per minute.';
END IF;

-- Note: This is informational. Real rate limiting should be handled by:
-- 1. Supabase functions rate limiting config
-- 2. Client-side throttling
-- 3. HTTP load balancer rules
```

---

## Deployment Checklist

Before applying migrations:

- [ ] **Backup production database**
- [ ] **Test migrations on dev/staging first**
- [ ] **Review all migration SQL for correctness**
- [ ] **Verify no syntax errors:** `psql -d your_db -f migration.sql`
- [ ] **Check function definitions after:** `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '...'`

After applying migrations:

- [ ] **Run all 31 tests from SECURITY_VALIDATION_TESTS.md**
- [ ] **Verify all tests PASS**
- [ ] **Check hands_public is actually cleaned:** `SELECT COUNT(*) FROM hands_public;` (should be 0 on fresh boards)
- [ ] **Test bid level 8 is rejected:** `SELECT submit_call(..., 'bid', 8, 'clubs')` → Should fail
- [ ] **Review migration logs for any errors**
- [ ] **Get sign-off from security team**

---

## Rollback Plan

If anything goes wrong:

```sql
-- Restore from backup
psql -d your_db -f /path/to/backup.sql

-- Or drop added constraints:
ALTER TABLE hands_public DROP CONSTRAINT IF EXISTS hands_public_unique_board_seat;

-- Or revert function:
CREATE OR REPLACE FUNCTION start_board(...) -- Old version
CREATE OR REPLACE FUNCTION submit_call(...) -- Old version
CREATE OR REPLACE FUNCTION play_card(...) -- Old version
```

---

## Timeline

| Milestone | Date | Status |
|-----------|------|--------|
| Identify gaps | ✅ Feb 4, 2026 | DONE |
| Create security analysis | ✅ Feb 4, 2026 | DONE |
| Plan migrations (this doc) | ✅ Feb 4, 2026 | DONE |
| Apply migrations to dev | [ ] Feb 5, 2026 | TODO |
| Run security tests | [ ] Feb 5, 2026 | TODO |
| Staging deployment | [ ] Feb 6, 2026 | TODO |
| Production deployment | [ ] Feb 7, 2026 | TODO |

---

**Document Status:** Implementation Guide  
**Audience:** Database Administrators, DevOps  
**Priority:** CRITICAL  
**Review Frequency:** Before each deployment
