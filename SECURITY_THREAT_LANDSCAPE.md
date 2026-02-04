# Security Threat Landscape & Mitigations

**Visual reference for understanding the security model.**

---

## Attack Surface Map

```
┌─────────────────────────────────────────────────────────────────┐
│                      BRIDGE GAME ATTACK SURFACE                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CLIENT LAYER                    NETWORK                SERVER  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  [Modified Client]              [HTTPS/TLS]      [Postgres]    │
│      │                               │               │          │
│      ├─ Fake bids              ├─ MITM Attack    ├─ RLS       │
│      ├─ Fake cards played      ├─ Session        ├─ RPC       │
│      ├─ Out of turn plays         hijacking      ├─ Locking   │
│      └─ Direct DB writes       └─ Replay         └─ Validation│
│                                                                 │
│  [Supabase Auth]                                              │
│       │                                                         │
│       ├─ Weak passwords                                        │
│       ├─ Compromised tokens                                    │
│       └─ Collusion via external chat                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Legend:
  ✅ = Prevented by our architecture
  ⚠️  = Mitigated by auth/infrastructure
  ❌ = Not prevented (expected)
```

---

## Threat-by-Threat Landscape

```
THREAT                          SEVERITY    OUR DEFENSE        ASSUMPTION
──────────────────────────────────────────────────────────────────────────

CLIENT-SIDE MANIPULATION
├─ Fake bid/call              MEDIUM      ✅ RPC validation   RPC no bugs
├─ Fake card play             MEDIUM      ✅ RPC validation   
├─ Out of turn play           MEDIUM      ✅ RPC validation + Turn check
├─ Card not in hand           MEDIUM      ✅ RPC validation   
├─ Skip follow-suit           MEDIUM      ✅ RPC validation   
├─ Double without bid         MEDIUM      ✅ RPC validation   
├─ Direct INSERT/UPDATE       MEDIUM      ✅ RLS blocks       RLS working
└─ Try to modify rules         LOW        ✅ RLS blocks       

INFORMATION DISCLOSURE
├─ Read opponent hand          HIGH       ✅ RLS blocks       Postgres RLS OK
├─ See dummy before reveal     HIGH       ✅ RLS blocks       
├─ game_events contains cards  HIGH       ✅ Code review      No RPC bugs
├─ Infer from bid pattern      LOW        ❌ Not prevented    Expected
├─ Timing attack (card presence) LOW      ⚠️  Possible but     Use HTTPS
│                                            not critical
└─ Log network traffic         MEDIUM     ⚠️  Requires HTTPS   Infrastructure

SESSION COMPROMISE
├─ Token hijacking             HIGH       ⚠️  Auth layer      Supabase JWT
├─ Weak password               MEDIUM     ⚠️  Auth layer      
├─ Replay old request          MEDIUM     ⚠️  Auth layer +    Session TTL
│                                           Transaction safety
├─ Brute-force auth            MEDIUM     ⚠️  Auth layer      Rate limiting
└─ Session fixation            MEDIUM     ⚠️  Auth layer      

INFRASTRUCTURE
├─ Postgres RLS bypass         CRITICAL   ❌ Not prevented    Trust Postgres
├─ Postgres code injection     CRITICAL   ✅ Parameterized    Supabase patch
├─ Malicious Postgres admin    CRITICAL   ❌ Not prevented    Access control
├─ Supabase breach             CRITICAL   ❌ Not prevented    Trust Supabase
└─ HTTPS/TLS compromise        CRITICAL   ⚠️  Cert pinning    Browsers do this

LOGICAL/SOCIAL
├─ Collusion via chat          LOW        ❌ Not prevented    Expected
├─ Players comparing hands     LOW        ❌ Not prevented    Game rule
├─ Timing analysis (slow play) LOW        ❌ Not prevented    Expected
└─ Card counting/signaling     LOW        ❌ Not prevented    Expected

──────────────────────────────────────────────────────────────────────────

LEGEND:
  ✅ Prevented by our code/database
  ⚠️  Mitigated by auth/infrastructure (someone else's responsibility)
  ❌ Not prevented (not possible or inherent to game)
```

---

## Defense Layers

```
┌─ CLIENT REQUEST (modified client, fake data)
│
├─ LAYER 1: INPUT VALIDATION ──────────────────────────┐
│  - Card format: ^[23456789TJQKA][SDHC]$             │ ✅ Prevents
│  - Bid level: 1-7                                    │    invalid
│  - Call type: one of enum values                     │    parameters
│                                                      │
├─ LAYER 2: BUSINESS LOGIC VALIDATION ────────────────┐
│  - Turn order: current_turn_seat == user_seat        │ ✅ Prevents
│  - Card in hand: SELECT hands_private WHERE card    │    illegal
│  - Follow suit: validate vs lead suit               │    moves
│  - Bid ordering: validate level/strain              │
│                                                      │
├─ LAYER 3: TRANSACTION SAFETY ───────────────────────┐
│  - SELECT ... FOR UPDATE (row lock)                 │ ✅ Prevents
│  - Atomic: move + turn update together              │    race
│  - Rollback on constraint violation                 │    conditions
│                                                      │
├─ LAYER 4: ROW-LEVEL SECURITY (RLS) ────────────────┐
│  - hands_private: WHERE owner_user_id = auth.uid()  │ ✅ Prevents
│  - hands_public: WHERE board.dummy_revealed = true  │    unauthorized
│  - game_events: WHERE room_id in user's rooms       │    reads
│                                                      │
├─ LAYER 5: WRITE POLICY ENFORCEMENT ────────────────┐
│  - No INSERT/UPDATE/DELETE policies                 │ ✅ Prevents
│  - RPC ONLY permitted mutations                     │    direct DB
│  - RLS denies all direct writes                     │    writes
│                                                      │
└─ SESSION/AUTH (Supabase responsibility)
   - JWT validation
   - Token expiration
   - HTTPS enforcement
   - Rate limiting
```

---

## Decision Tree: Can a Player Cheat?

```
                    Player wants to cheat
                            │
                            ├─ Play card not in hand?
                            │   └─ RPC checks hands_private ──→ ❌ BLOCKED
                            │
                            ├─ Play out of turn?
                            │   └─ RPC checks current_turn_seat ──→ ❌ BLOCKED
                            │
                            ├─ Skip follow-suit?
                            │   └─ RPC validates lead suit ──→ ❌ BLOCKED
                            │
                            ├─ Invalid bid?
                            │   └─ RPC validates level/strain ──→ ❌ BLOCKED
                            │
                            ├─ See opponent hand?
                            │   └─ RLS blocks hands_private ──→ ❌ BLOCKED
                            │
                            ├─ Direct DB write?
                            │   └─ RLS denies INSERT/UPDATE ──→ ❌ BLOCKED
                            │
                            ├─ Infer opponent cards from bids?
                            │   └─ No prevention (expected) ──→ ⚠️  ALLOWED*
                            │                                   (* inherent to game)
                            │
                            ├─ Hijack another player's session?
                            │   └─ Supabase auth layer ──→ ⚠️  POSSIBLE IF
                            │                                  COMPROMISED
                            │
                            └─ Compromise the Postgres server?
                                └─ Infrastructure security ──→ ❌ OUR
                                                                  PROBLEM?
```

---

## Risk Heatmap

```
                                   LIKELIHOOD
                        Low         Medium         High
                        ──────────────────────────────────
                   │    ┌─────────┬──────────┬──────────┐
                   │    │         │          │          │
IMPACT        HIGH │    │  Postgres Collusion  Network  │
                   │    │  Breach   (chat)    (MITM)    │
                   │    │ [Red]    [Yellow]  [Red]     │
                   │    ├─────────┼──────────┼──────────┤
                   │    │ Session  │Timing   │ Card     │
       MEDIUM      │    │ Hijack   │Attack   │ Format   │
                   │    │ [Red]    │[Yellow] │[Green]   │
                   │    ├─────────┼──────────┼──────────┤
                   │    │          │          │ Info     │
       LOW         │    │          │          │ Inference│
                   │    │          │          │[Green]   │
                   │    └─────────┴──────────┴──────────┘
                   │
                   └─ OUR SYSTEM

Legend:
  🟢 Green = We prevent it
  🟡 Yellow = Mitigated (depends on infrastructure)
  🔴 Red = Cannot prevent (infrastructure problem)

Critical (must not happen):
  - Postgres breach → Infrastructure responsibility
  - MITM attack → HTTPS responsibility
  - Session hijacking → Auth responsibility

Acceptable (inherent to game):
  - Information inference → Expected
  - Timing attacks → Side-channel, acceptable for casual game
```

---

## Security Maturity Levels

```
WHAT WE HAVE NOW (Level 3 / MVP):

Level 1: No security
  ├─ Anyone can write anywhere
  └─ Anyone can read anything

Level 2: Basic access control
  ├─ Some RLS in place
  └─ Some validation in code

Level 3: RLS + RPC validation ← WE ARE HERE
  ├─ ✅ All writes via RPC only
  ├─ ✅ RLS on all tables
  ├─ ✅ Turn order validated
  ├─ ✅ Card ownership validated
  ├─ ✅ Follow-suit validated
  └─ ✅ Hand privacy enforced

Level 4: Hardened (optional enhancements)
  ├─ Idempotency keys for replay safety
  ├─ Rate limiting on RPC calls
  ├─ Audit logging for security events
  ├─ Timing attack mitigation
  └─ Behavioral analysis for cheating detection

Level 5: Enterprise security (probably overkill)
  ├─ VPN requirements
  ├─ Hardware security keys
  ├─ Real-time anomaly detection
  ├─ Compliance audits (SOC2, etc.)
  └─ Dedicated security team

WE RECOMMEND: Stay at Level 3 for MVP. Move to Level 4 if issues arise.
```

---

## Known Unknowns

```
Things we validated:
  ✅ RLS policies are correct (syntax verified)
  ✅ RPC functions have correct logic (code reviewed)
  ✅ RPC functions use SECURITY DEFINER correctly
  ✅ search_path is hardened
  ✅ No secrets in function source
  ✅ game_events contains no private hands
  ✅ Dummy reveal only adds one hand

Things we ASSUME (outside our control):
  ⚠️ Supabase JWT implementation is correct
  ⚠️ Postgres RLS implementation has no 0-days
  ⚠️ TLS/HTTPS is properly configured
  ⚠️ Supabase admins are trustworthy
  ⚠️ Postgres server is physically secure
  ⚠️ Network is not compromised

Things we DON'T prevent (and shouldn't):
  ❌ Players colluding via external chat
  ❌ Information inference from game moves
  ❌ Timing attacks (side-channel)
  ❌ Infrastructure-level attacks
  ❌ Social engineering
```

---

## Deployment Risk Assessment

```
RISK LEVEL: 🟢 LOW (for casual game) / 🟡 MEDIUM (if high-stakes)

For casual/social game:
  - Risk of cheating: LOW
  - Impact if cheated: LOW
  - Detectability: LOW (not a concern)
  - Remediation: Reset game, re-deal
  → Deploy with confidence

For competitive/high-stakes game:
  - Risk of cheating: MEDIUM
  - Impact if cheated: HIGH
  - Detectability: MEDIUM (audit logs)
  - Remediation: Disqualify players, investigate
  → Recommend additional controls (audit logs, monitoring)

For tournament play:
  - Risk of cheating: HIGH
  - Impact if cheated: CRITICAL
  - Detectability: LOW (need ML analysis)
  - Remediation: Replay, investigate, ban
  → Recommend Level 4+ security (behavioral analysis, etc.)
```

---

## What to Monitor

**If deploying to production:**

```
Daily checks:
  - Error logs for RLS violations (shouldn't happen)
  - RPC function execution times (for timing attacks)
  - game_events payload for leaks (shouldn't happen)

Weekly checks:
  - Supabase advisories (security issues)
  - Database performance (queries getting slower?)
  - User complaint patterns (cheating reports?)

Monthly checks:
  - Re-run security test suite (all 31 tests)
  - Review any new Postgres CVEs
  - Audit JWT token refresh frequency

Quarterly review:
  - Full threat model review (any new threats?)
  - Update risk assessment
  - Plan security upgrades (if needed)
```

---

## Conclusion

**This architecture provides solid protection against client-side cheating** through:
- Server-side validation (RPC)
- Row-level security (RLS)
- Transaction safety (locking)
- Turn order enforcement
- Card ownership validation
- Hand privacy enforcement

**It does NOT prevent:**
- Information inference (inherent to game)
- Session hijacking (auth responsibility)
- Infrastructure compromise (Postgres responsibility)

**For casual play:** ✅ **Sufficient security**  
**For competitive play:** ⚠️ **Adequate; consider audit logging**  
**For high-stakes play:** ❌ **Not suitable without Level 4+ enhancements**

---

**Document:** Security Threat Landscape  
**Status:** Reference  
**Last Updated:** February 4, 2026
