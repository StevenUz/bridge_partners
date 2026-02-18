# Copilot Instructions for Bridge Partners App

## Project Overview

**Bridge Partners** is a multiplayer online bridge card game where friends can play together remotely. The app enables players to log in, join the lobby, sit at a table in a position (South, West, North, or East), deal cards, participate in bidding, play cards, and view game results. The app also supports observers who can view all players' cards and includes features like chat and statistics tracking.

Key features:
- User authentication and session management
- Lobby system for finding and joining games
- Real-time multiplayer table gameplay
- Deal distribution and bidding system
- Card play and scoring calculations
- Observer mode with full visibility
- Chat functionality
- Game statistics and history

## Architecture & Technology Stack

### Client-Server Architecture
- **Front-end**: Vite-powered Single Page Application (SPA) with Vanilla JavaScript
- **Back-end**: Supabase (BaaS platform)
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth
- **Real-time Communication**: Supabase Realtime
- **API**: Supabase REST API & PostgREST
- **File Storage**: Supabase Storage
- **Hosting**: Netlify (with history fallback for SPA routing)
- **Source Control**: GitHub

## UI Guidelines

- **Framework & Styling**: Use HTML5, CSS3, Bootstrap, and Vanilla JavaScript (no heavy frameworks)
- **Architecture**: Treat UI as modular fragments—each component/page lives in its own folder with `*.html`, `*.css`, and `*.js` files
  - Import HTML with `?raw` query parameter for raw text import
  - Import CSS directly as modules
- **Rendering Pattern**:
  - Header and footer render once at app initialization
  - Pages render into the `main` outlet on navigation
  - Use stateless render functions that receive `{language, t, applyTranslations, onLanguageChange, navigate}` as parameters
- **Routing**: Use clean history URLs (`/`, `/lobby`, `/table`, `/statistics`). Implement with `appType: 'spa'` in Vite and history pushState. Avoid hash routing.
- **Internationalization**: Language selection must appear in registration/home view, lobby, and table views. Persist language choice in localStorage and reapply translations on route changes.
- **Visual Design**:
  - Use a consistent color scheme and typography throughout the app
  - Employ appropriate icons, effects, and visual cues to enhance usability
  - Ensure responsive design for different screen sizes

## Backend & Database Guidelines

- **Database Management**:
  - Use PostgreSQL (via Supabase) as the primary database
  - Maintain tables for users, authentication, game results, cards, sessions, lobbies, etc.
  - Always use migrations for schema changes to track version history
  - After applying migrations in Supabase, keep a copy of the migration SQL file in the `migrations/` directory
  - Use meaningful migration naming: `{number}_{descriptive_name}.sql` (e.g., `25_add_contract_tracking.sql`)
  
- **API Integration**:
  - Use Supabase REST API and PostgREST for data operations
  - Leverage Supabase Realtime for real-time updates (chat, game state, player positions)
  - Use Supabase Storage for file uploads and media management

- **Schema Design**:
  - Create appropriate tables for game entities: users, game_tables, deals, bids, plays, results, chat_messages, etc.
  - Use proper relationships and foreign keys
  - Implement indexes on frequently queried columns for performance

## Authentication & Authorization Guidelines

- **User Authentication**:
  - Use Supabase Auth for all user authentication and session management
  - Support registration, login, logout, and password reset flows
  - Store user session tokens securely (handled by Supabase client SDK)

- **Authorization & Access Control**:
  - Implement Row Level Security (RLS) policies on all tables to restrict data access
  - Use RLS policies based on user roles, game participation, and data ownership
  - Create separate `user_roles` table with enum for roles (e.g., `admin`, `verified_player`, `observer`)
  
- **Security Best Practices**:
  - Implement RLS policies to ensure users can only access their own data or data explicitly shared with them
  - Validate all user input on the backend (Supabase Edge Functions or application logic)
  - Use environment variables for sensitive configuration (API keys, endpoints)
  - Never expose private or service role keys in client-side code

## Bridge Game Concepts

### Vulnerability System
- In bridge, partnerships can be "Vulnerable" (В Зона) or "Not Vulnerable" (Без Зона)
- Vulnerability affects scoring: higher penalties for failed contracts and higher bonuses for made contracts when vulnerable
- Uses artificial 16-deal cycle for scoring purposes with IMP tables
- Cycle resets when any player leaves and new player joins
- Pattern: "0_-_|_+_-_|_+_0_|_+_0_-_+_0_-_|" where:
  - "0" = neither partnership vulnerable  
  - "-" = East-West vulnerable
  - "|" = North-South vulnerable
  - "+" = both partnerships vulnerable
  - "_" = deal separator
- Dealer rotates clockwise each deal: South → West → North → East → South...

## Development Workflow

- **Version Control**: Use Git and GitHub for source control
- **Migrations**: Always create migrations for DB schema changes; never modify tables directly in production
- **Testing**: Create tests for complex logic (bidding, scoring, game mechanics)
- **Code Organization**: Keep code modular and maintainable; follow consistent naming conventions
- **Environment Setup**: Use environment variables for Supabase URL and anon key (stored in `.env` files, never committed)
