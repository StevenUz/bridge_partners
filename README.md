# Bridge Partners

Vite-powered SPA for a multiplayer bridge lobby with clean history URLs (`/`, `/lobby`, `/table`, `/statistics`). Pages and components are modular HTML/CSS/JS fragments with Bootstrap styling.

## Scripts
- `npm install` — install dependencies
- `npm run dev` — start Vite dev server on port 5000 with history fallback
- `npm run build` — build for production
- `npm run preview` — preview the production build on port 5000

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
