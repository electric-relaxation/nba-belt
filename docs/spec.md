# NBA Championship Belt Tracker — SSR Spec (Prototype)

## 1. Overview

Build a website that tracks the holder of an unofficial NBA “Championship Belt” for a given NBA season.

The site must:
- Prominently display the current belt holder (team name + logo).
- Display the belt holder’s next scheduled game (opponent + logos + date/time).
- Display a chronological list of all games that caused a belt transfer (date, teams w/ logos, score).
- For every team mention anywhere on the site, show the team logo alongside the team name.

This is a simple prototype:
- No user accounts
- No admin UI
- No database required
- No need to optimize for high traffic
- Prefer free services and free tiers

**Key UX requirement:** the homepage should load with the belt holder, next game, and transfer history already rendered in the initial HTML (SSR). No “fetch then fill-in” required.

Hosting: Cloudflare Pages on a custom domain.

---

## 2. Definitions & Glossary

**Season**: An NBA season identified by the starting calendar year (e.g., “2025” for 2025–26).
**Regular season**: Only regular-season games count for belt transfers.
**Belt holder**: The team currently holding the belt at the present moment.
**Transfer game**: A game that results in a belt changing teams.

---

## 3. Belt Rules (Source of Truth)

1) At the start of the season, the winner of last season’s NBA Finals holds the belt.
2) During the regular season, the belt is acquired by winning against the current belt holder.

Implementation notes:
- Transfer occurs only when the current holder **loses** a completed regular-season game.
- If the belt holder wins, the belt remains with them.
- If the belt holder does not play in a game, it cannot affect the belt.
- Ignore preseason and playoffs.

---

## 4. Supported Scope

### 4.1 Season support
- Must support computing belt for the “current season” (default).
- Provide a mechanism to select a season via query parameter:
  - `/api/belt?season=2025`
- UI may initially show only the current season; multi-season browsing is a future enhancement.

### 4.2 Games included
- Regular season only.
- Completed games only (final scores).
- Ignore postponed/cancelled games unless the data source marks them as completed.

### 4.3 Time & ordering
- Sort games by actual game start datetime (ascending).
- If two games share the same start datetime (rare), break ties deterministically (e.g., by game id).

### 4.4 Time zone
- Display next-game times in the viewer’s local time (browser default) if possible OR explicitly in America/Los_Angeles as a fallback.
- Be consistent across UI.

---

## 5. Architecture (SSR-first)

### 5.1 Rendering model
- Use Astro’s Cloudflare adapter and deploy as an SSR site on Cloudflare Pages. SSR routes render on Pages Functions.  [oai_citation:0‡Cloudflare Docs](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/?utm_source=chatgpt.com)
- Site homepage `/` is **server-rendered** by default (SSR).
- Optional: keep an `/api/belt` endpoint for debugging/inspection, but the homepage does not depend on a client fetch.

Astro config expectations:
- Use `@astrojs/cloudflare` adapter.  [oai_citation:1‡Astro Docs](https://docs.astro.build/en/guides/integrations-guide/cloudflare/?utm_source=chatgpt.com)
- SSR output mode is `output: 'server'` (the adapter sets/uses server output for on-demand rendering).  [oai_citation:2‡Cloudflare Docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/?utm_source=chatgpt.com)

### 5.2 Data flow per page request
When a request for `/` arrives:
1) Server code loads belt data (from cache if available).
2) Server renders HTML containing:
   - current holder (logo + name)
   - next game (logos + date/time)
   - transfer history list/table
3) Response returns as complete HTML.

---

## 6. Performance & Caching (Critical)

Cloudflare has two different caching systems you must not confuse:
- “CDN cache” (default static file caching behavior)
- Workers/Pages **Cache API** via `caches.default` (programmable, datacenter-local)  [oai_citation:3‡Cloudflare Docs](https://developers.cloudflare.com/workers/runtime-apis/cache/?utm_source=chatgpt.com)

### 6.1 Cache belt computation results (required)
Cache the computed belt JSON/data using **Cache API** for 10 minutes:
- Key: `belt:{season}` (or a request URL like `/__belt_cache?season=2025`)
- TTL: 600 seconds
- This is implemented in server code (Pages Function runtime). Pages Functions have access to Cache API.  [oai_citation:4‡Cloudflare Docs](https://developers.cloudflare.com/workers/runtime-apis/cache/?utm_source=chatgpt.com)

Notes:
- Cache API is **datacenter-local** (not globally replicated automatically). That’s OK for this prototype.  [oai_citation:5‡Cloudflare Docs](https://developers.cloudflare.com/workers/runtime-apis/cache/?utm_source=chatgpt.com)
- This cache is primarily to reduce upstream API calls and keep SSR fast for repeat visits.

### 6.2 Cache the SSR HTML (optional but recommended)
Cloudflare’s default CDN behavior **does not cache HTML or JSON by default**.  [oai_citation:6‡Cloudflare Docs](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/?utm_source=chatgpt.com)  
If we want Cloudflare edge caching for `/` HTML:
- Set response headers on `/`:
  - `Cache-Control: public, s-maxage=600, max-age=60`
- Add a Cloudflare **Cache Rule** for the homepage route to “Cache Everything” and (optionally) “Respect Origin Cache-Control” / Origin Cache Control.  [oai_citation:7‡Cloudflare Docs](https://developers.cloudflare.com/cache/concepts/cache-control/?utm_source=chatgpt.com)

This makes repeat homepage loads extremely fast even before SSR executes.

---

## 7. Data Sources

### 7.1 Primary game data API
Use BALLDONTLIE (or equivalent) to fetch games for a season:
- needs game datetime, home/away teams, final scores, status, and season identifier
- API key stored as env var `BALLDONTLIE_API_KEY` (never committed to git)

### 7.2 Team metadata
Need:
- Team abbreviation (e.g., “OKC”)
- Team full name (e.g., “Oklahoma City Thunder”)

This may come from the API or a static mapping file.

### 7.3 Logos
All team references must include a logo.
Implement a deterministic logo URL builder from team abbreviation and keep a small override map if needed.

If a logo fails to load:
- show a graceful placeholder (no broken image icon).

---

## 8. SSR Page Requirements

### 8.1 Homepage sections (SSR-rendered)
Render these in the initial HTML:

1) **Hero: Current Belt Holder**
   - Team logo (large)
   - Team name
   - Current record

2) **Next Game**
   - “Next game for [Holder]”
   - Opponent logo + name
   - Date + time
   - Home/away indicator (e.g., “vs” or “@”)

3) **Transfer History**
   - Table or list of all belt transfer games in chronological order (oldest → newest)
   - For each transfer:
     - Date
     - Previous holder → New holder (logos + names)
     - Final score (e.g., “OKC 112 – DEN 109”)

### 8.2 Visual style
- Clean, modern, minimal
- Good spacing, consistent typography
- Responsive (works on mobile + desktop)
- Accessible: proper alt text for logos, good contrast, semantic headings

### 8.3 Logos
Every team reference must include its logo:
- Hero section
- Next game section (both teams)
- Transfer history (both teams)

If a logo fails to load:
- Show a small placeholder (e.g., initials in a circle) instead of broken-image icons.

### 8.4 Client-side JS
Not required for core functionality.
OK to add small progressive enhancement (sorting, collapsible history, etc.) but the page must be complete without it.

---

## 9. Backend API (Optional)

Optional debugging endpoint:
`GET /api/belt?season=YYYY`

If implemented, response should include:
- `season`, `computedAt`
- `startingHolder`, `currentHolder`, `nextGame`
- `transfers[]`

This endpoint should also use the same Cache API strategy (10 minutes).

---

## 10. Belt Computation Algorithm (Deterministic)

Inputs:
- `games[]`: all games for the season (regular season + scheduled/final)
- `startingHolderAbbr`: the Finals champion from previous season
- `now`: current time

Steps:
1) Filter to completed regular-season games
2) Sort by `startTimeUtc` ascending (stable)
3) holder = startingHolderAbbr
4) For each game:
   - if holder not in {home, away}: continue
   - determine winner by score
   - if winner != holder:
     - record a transfer with from=holder, to=winnerAbbr, game metadata, and final score
     - holder = winner
5) Compute nextGame:
   - From all games in season (including scheduled), find the earliest game with startTimeUtc > now where holder is either home or away.
   - If none exists, nextGame = null.

Output:
- `currentHolder` = holder
- `nextGame` or null
- `transfers[]` = recorded list

---

## 11. Starting Holder (v1)

Hardcode `startingHolderAbbr` per season in `src/lib/startingHolders.ts`:
- Example: season 2025 (2025–26) → `OKC`
- Add entries as needed.

This avoids building a “find previous Finals winner” feature in v1.

Future enhancement: derive automatically from historical season results.

---

## 12. Suggested Project Structure

- `src/pages/index.astro` — SSR homepage
- `src/lib/belt.ts` — `computeBelt(...)` pure function
- `src/lib/data.ts` — `getBeltData(season, now, env)` with Cache API usage
- `src/lib/teams.ts` — team names, abbreviations, logo URL builder + overrides
- `functions/api/belt.ts` — optional Cloudflare Pages Function debugging endpoint
- `docs/spec.md` — this spec

---

## 13. Testing Requirements (Prototype-Friendly)

Minimum tests:
 - 	Unit test for computeBelt with a small synthetic schedule:
 - 	At least 2 transfers
 - 	Confirm holder after each transfer
 - 	Confirm nextGame selection logic

---

## 14. Acceptance Criteria (Definition of Done)

Performance:
- Homepage loads with all core content server-rendered (no spinner required).
- Belt data is cached via Cache API for 10 minutes.

Correctness:
- Belt logic follows the rules exactly and is deterministic.
- Transfer history includes all and only transfer games.

UX/Frontend:
- Homepage loads and displays:
  - Current holder (logo + name)
  - Next game (logos + teams + time) or “No upcoming games”
  - Transfer history list with date + teams + score
  - All team mentions display logos; broken images degrade gracefully.
- Clean modern design, responsive.

Deployment:
 - 	Site deploys on Cloudflare Pages.
 - 	Site accessible via the custom Cloudflare-managed domain.