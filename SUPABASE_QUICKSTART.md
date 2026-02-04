# Supabase Backend - Quick Start

## ✅ Migrations Applied

5 migrations have been successfully applied to your Supabase database:

1. **create_core_tables** - Base schema with profiles, rooms, members, seats, matches, boards
2. **create_game_state_tables** - Hands, auctions, tricks, plays, results
3. **create_event_log** - Real-time event sourcing table
4. **enable_rls_and_policies** - Row Level Security for multiplayer privacy
5. **fix_function_security** - Security hardening for helper functions

## 📊 Database Schema

### 13 Tables Created

✅ **profiles** - User accounts (extends auth.users)  
✅ **rooms** - Game tables  
✅ **room_members** - Players and spectators  
✅ **room_seats** - N/S/E/W positions  
✅ **matches** - 16-deal vulnerability cycles  
✅ **boards** - Individual deals  
✅ **hands** - 4 × 13 cards per board  
✅ **auctions** - Bidding phase state  
✅ **auction_calls** - Bid history  
✅ **tricks** - 13 tricks per board  
✅ **plays** - 4 cards per trick  
✅ **board_results** - Scores and IMPs  
✅ **game_events** - Append-only event log for sync

### Custom Enums

- `seat_position`: north, south, east, west
- `strain`: clubs, diamonds, hearts, spades, notrump
- `vulnerability`: none, ns, ew, both
- `room_status`: waiting, active, completed
- `board_status`: dealing, auction, play, completed
- `double_status`: none, doubled, redoubled
- `call_type`: bid, pass, double, redouble
- `member_role`: player, spectator
- `event_type`: room_created, player_joined, board_started, card_played, etc.

## 🔒 Security

✅ **RLS Enabled** on all tables  
✅ **Helper functions** secured with `search_path`  
✅ **No security advisories** from Supabase linter  
⚠️ **Hand privacy**: Currently enforced at application layer (see SUPABASE_SCHEMA.md)

## 🚀 Next Steps

### 1. Get Supabase URL and Keys

```bash
# Get your project URL
supabase status

# Your anon key is in the Supabase dashboard
# Project Settings > API > anon public key
```

### 2. Install Supabase Client

```bash
npm install @supabase/supabase-js
```

### 3. Initialize Client

```javascript
// src/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### 4. Set Up Auth

```javascript
// Example: Sign up with email
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure_password'
});

// Insert profile after signup
await supabase.from('profiles').insert({
  id: data.user.id,
  username: 'player123',
  display_name: 'Player Name'
});
```

### 5. Real-time Event Subscription

```javascript
// Subscribe to room events
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
      console.log('New event:', payload.new);
      handleGameEvent(payload.new);
    }
  )
  .subscribe();
```

### 6. TypeScript Types (Recommended)

Generate types for your schema:

```bash
# If using Supabase CLI
supabase gen types typescript --local > src/types/supabase.ts

# Or from remote project
supabase gen types typescript --project-id your-project-id > src/types/supabase.ts
```

## 📖 Documentation

- **[SUPABASE_SCHEMA.md](./SUPABASE_SCHEMA.md)** - Complete schema reference with queries
- **[Supabase Docs](https://supabase.com/docs)** - Official documentation

## 🔧 Performance Notes

The following performance optimizations are **NOT critical** for MVP but can be added later:

1. **RLS Performance**: Wrap `auth.uid()` in `(select auth.uid())` for better query plans
2. **Missing Indexes**: Add indexes on `room_seats.profile_id` and `rooms.current_match_id` if queries become slow
3. **Unused Indexes**: All indexes are currently unused because database is empty (normal for fresh schema)

## 🎮 Example: Complete Game Flow

```javascript
// 1. Create room
const { data: room } = await supabase
  .from('rooms')
  .insert({ name: 'My Bridge Table', created_by: userId })
  .select()
  .single();

// 2. Join as member
await supabase.from('room_members').insert({
  room_id: room.id,
  profile_id: userId,
  role: 'player'
});

// 3. Take a seat
await supabase
  .from('room_seats')
  .update({ profile_id: userId, seated_at: new Date().toISOString() })
  .eq('room_id', room.id)
  .eq('seat_position', 'north')
  .is('profile_id', null);

// 4. Start match (when 4 players seated)
const { data: match } = await supabase
  .from('matches')
  .insert({ room_id: room.id, deal_cycle_position: 0 })
  .select()
  .single();

// 5. Create first board
const { data: board } = await supabase
  .from('boards')
  .insert({
    match_id: match.id,
    board_number: 1,
    dealer: 'north',
    vulnerability: 'none',
    status: 'dealing'
  })
  .select()
  .single();

// 6. Deal hands (server-side)
// [Deal cards and insert into hands table]

// 7. Subscribe to events and play!
```

## ⚠️ Important Reminders

1. **Hand Visibility**: The RLS allows room members to read all hands. Your client code MUST enforce visibility rules (own hand + dummy after opening lead).

2. **Server Authority**: For production, add Supabase Edge Functions to validate moves server-side before writing to database.

3. **Event Log**: Always append to `game_events` when state changes - this enables reconnection and replay.

4. **Vulnerability Cycle**: Pattern is stored in `matches.deal_cycle_position` (0-15). See SUPABASE_SCHEMA.md for mapping.

## 🎯 Ready to Code!

Your Supabase backend is fully configured and ready for integration with your Bridge game frontend. Check [SUPABASE_SCHEMA.md](./SUPABASE_SCHEMA.md) for detailed query examples and patterns.
