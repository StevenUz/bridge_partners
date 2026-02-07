# Bridge Partners

Vite-powered SPA for a multiplayer bridge lobby with clean history URLs (`/`, `/lobby`, `/table`, `/statistics`). Pages and components are modular HTML/CSS/JS fragments with Bootstrap styling.

## Scripts
- `npm install` — install dependencies
- `npm run dev` — start Vite dev server on port 5000 with history fallback
- `npm run build` — build for production
- `npm run preview` — preview the production build on port 5000
- `npm run supabase:pull` — pull remote Supabase schema into local migrations

## Structure
- `src/main.js` — bootstrap app, router wiring, language state
- `src/routes.js` — route table
- `src/components/*` — header and footer fragments (`.html?raw`, `.css`, `.js`)
- `src/pages/*` — page fragments (Home, Lobby, Table, Statistics)
- `src/i18n/i18n.js` — translations (EN/BG), language persistence, helpers
- `src/styles/main.css` — shared styles

## Notes
- Navigation uses `history.pushState` (no hash routing); Vite is configured with `appType: 'spa'` for fallback.
- Language pickers appear in Home, Lobby, and Table; selection persists in `localStorage` and re-applies translations per route.

## Supabase Migrations (Pull Regularly)
Use the pull script to sync remote schema into local SQL migration files in `supabase/migrations`.

**One-time setup (per machine):**
1. Create a Supabase access token: Dashboard → Account Settings → Access Tokens.
2. Get your database password: Project Settings → Database.
3. Set environment variables:
	- `SUPABASE_ACCESS_TOKEN`
	- `SUPABASE_DB_PASSWORD`

**Run pull:**
- `npm run supabase:pull`

**Suggested cadence:** weekly and after any database change.
