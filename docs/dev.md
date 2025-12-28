# Development

## Local setup

1. Install Node.js (18+) and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set `BALLDONTLIE_API_KEY` for local scripts.
4. Backfill once for a season (creates `data/games-<season>.json`):
   - `npm run backfill:games -- --season 2025`

## Environment variables

- `BALLDONTLIE_API_KEY`: required for scripts that pull from BALLDONTLIE. The production runtime does not use this env var.
- Keep `.env` local only; commit `.env.example` instead.
- GitHub Actions reads `BALLDONTLIE_API_KEY` from repository secrets (Settings -> Secrets and variables -> Actions), not from `.env`.

## Run locally

- `npm run dev` (Astro dev server)
- `npm run build` (production build)
- `npm run preview` (preview build)
- `npm run test` (Vitest)

## Data flow and caching (brief)

- `scripts/backfill-games.mjs` and `scripts/update-games.mjs` pull from BALLDONTLIE, and GitHub Actions should do the same on a schedule.
- The production runtime reads committed JSON in `data/games-<season>.json` and never calls BALLDONTLIE directly.
- Belt computation results are cached in the Cloudflare Cache API for 10 minutes to reduce recomputation.
