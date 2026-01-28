- Keep the app as a Vite-powered SPA with clean history URLs (`/`, `/lobby`, `/table`, `/statistics`). Use `appType: 'spa'` and history pushState for navigation.
- Treat UI as modular fragments: each component/page lives in its own folder with `*.html`, `*.css`, and `*.js`, imported with `?raw` for HTML and direct CSS imports.
- Header and footer render once; pages render into the `main` outlet. Prefer stateless render functions that receive `{language, t, applyTranslations, onLanguageChange, navigate}`.
- Language selection must appear in the registration/home view, lobby, and table views. Persist selected language (localStorage) and reapply translations on route changes.
- Avoid hash routing; rely on history fallback (index.html) for dev/preview. Keep URLs readable and side-effect free on navigation.

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
