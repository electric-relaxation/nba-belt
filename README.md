# NBA Championship Belt

Tracks the unofficial NBA Championship Belt at **https://electricrelaxation.com/nba-belt**.

The belt starts each season with the reigning NBA champion. Beat the holder in a regular-season game and it's
yours. The site shows the current holder, their next (or live) game, and every change of hands, for every season
since 2014–15. Seasons go by the year they start: "2025" is the 2025–26 season. The full requirements are in
[docs/spec.md](docs/spec.md).

## How it works

```
Browser ─→ electricrelaxation.com/nba-belt*   (only this path; the rest of the domain is untouched)
            ├─ static files: the page, logos, past seasons (public/nba-belt/)
            └─ /nba-belt/api/*  ─→  Worker  ─→  Workers KV (current season)
Every 2 min: Worker ─→ ESPN scoreboards ─→ belt rules ─→ Workers KV
```

- **One Cloudflare Worker** handles everything under `/nba-belt`. Cloudflare serves the static files directly;
  the Worker's code only answers the two API URLs and runs the scheduled job.
- **The page** is plain HTML, CSS and JavaScript, with no framework and no build step. It asks the API for data,
  refreshes itself every minute, and loads the other seasons in the background so switching is instant.
- **Every 2 minutes** the Worker reads ESPN's public scoreboard, applies the belt rules, and saves the current
  season to Workers KV, Cloudflare's key-value storage.
- **Past seasons** are precomputed JSON files in `public/nba-belt/data/`, made by `npm run backfill`.
- **No yearly upkeep.** On opening day the job starts the new season by itself, with last season's champion
  (read from ESPN) holding the belt. Until then the site shows the finished season.

It all fits in Cloudflare's free plan.

## Project layout

| Path | What it is |
|---|---|
| `public/nba-belt/` | The website: `index.html`, `app.js`, `styles.css`, logos, team list, icons |
| `public/nba-belt/data/` | Precomputed past seasons |
| `src/belt.ts` | The belt rules |
| `src/tracker.ts` | Brings a season up to date, one day of ESPN scoreboards at a time |
| `src/update.ts` | One run of the 2-minute job, including starting a new season on opening day |
| `src/espn.ts` | Reads ESPN's API. The only file that knows ESPN's data format |
| `src/worker.ts` | The Worker itself: API routes and the scheduled job's entry point |
| `scripts/backfill.ts` | Recomputes past seasons into `public/nba-belt/data/` |
| `scripts/fetch-teams.ts` | Rebuilds the team list and downloads logos (only needed if a team rebrands) |
| `test/` | Unit tests, with a few saved ESPN responses in `test/fixtures/` |
| `wrangler.jsonc` | Cloudflare settings: the route, the schedule, the storage |

## Running it on your Mac

You need Node.js 22.18 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:8787/nba-belt/. To run the 2-minute job once by hand while `npm run dev` is running:

```bash
curl "http://localhost:8787/__scheduled?cron=*/2+*+*+*+*"
```

Other commands:

- `npm test` runs the unit tests.
- `npm run typecheck` checks the TypeScript.
- `npm run backfill` recomputes every past season from ESPN. `npm run backfill -- 2019` does one season, and
  `npm run backfill -- 2019 2021` does a range.

## Deploying

The storage already exists (its ID is in `wrangler.jsonc`). On a new computer, sign in to Cloudflare once:

```bash
npx wrangler login
```

After that, every deploy is one command:

```bash
npm run deploy
```

To deploy automatically on every push to `main` instead, connect the GitHub repo in the Cloudflare dashboard
(Workers & Pages → nba-belt → Settings → Builds → Connect). Leave the build command empty and keep the deploy
command `npx wrangler deploy`.

## If something looks wrong

- The footer's "Updated X ago" says when the data was last refreshed. If it's more than a few minutes old,
  check the Worker's logs in the Cloudflare dashboard (Workers & Pages → nba-belt → Observability), or run
  `npx wrangler tail`.
- ESPN's API is unofficial and can change without notice. Everything that depends on it is in `src/espn.ts`.
- ESPN blocks most server-side requests to `site.api.espn.com`, so the Worker uses `site.web.api.espn.com`, which
  serves the same data.

## Notes

- Team logos come from ESPN's image CDN and are trademarks of their teams. This is a personal, non-commercial
  project, not affiliated with the NBA.
