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
- GitHub Actions reads `BALLDONTLIE_API_KEY` from repository secrets (Settings -> Secrets and variables -> Actions), not from `.env`; the scheduled update workflow depends on it.

## Run locally

- `npm run dev` (Astro dev server)
- `npm run build` (production build)
- `npm run preview` (preview build)
- `npm run test` (Vitest)

## Data flow and caching (brief)

- `scripts/backfill-games.mjs` and `scripts/update-games.mjs` pull from BALLDONTLIE, and GitHub Actions should do the same on a schedule.
- The production runtime reads committed JSON in `data/games-<season>.json` and never calls BALLDONTLIE directly.
- Belt computation results are cached in the Cloudflare Cache API for 10 minutes to reduce recomputation.

## Starting holders

- `data/starting-holders.json` maps season start years to team abbreviations.
- Format: `{ "2025": "OKC" }` where the key means the 2025-26 season starting holder.
- Add a new entry whenever a new season is created; the site will show a friendly error if the season key is missing.

## Champion lookup helper

- `scripts/compute-champion.mjs --season <YYYY>` fetches postseason games from BALLDONTLIE and prints `{ "season": YYYY, "championAbbr": "XXX", "sourceGameId": 123 }`.
- The script exits non-zero if postseason games are still in the future; use `--force` to bypass this safety guard.

## Season bootstrap

- `scripts/bootstrap-season.mjs` scans `data/games-YYYY.json` to find the current season and decides whether to create the next season.
- If `data/starting-holders.json` is missing the next season, it runs `scripts/compute-champion.mjs` for the current season and adds the champion as the next starting holder.
- It probes BALLDONTLIE for regular-season games in the next season and, if found, creates `data/games-<nextSeason>.json` with an empty games array.
- The script prints `UPDATE_SEASON=YYYY` so automation knows which season should be updated next.
