// Computes season records into public/nba-belt/data/, using the same code as the live site.
//
//   npm run backfill               every season from FIRST_SEASON through the current one
//   npm run backfill -- 2019       one season
//   npm run backfill -- 2019 2021  a range of seasons
//
// Seasons that haven't started are skipped. ESPN responses for past dates are cached in the
// system temp folder, so re-runs are quick.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIRST_SEASON } from '../src/config.ts';
import { fetchDay as fetchFromEspn } from '../src/espn.ts';
import { addDays, easternDate } from '../src/time.ts';
import { advanceSeason, newSeasonRecord, seasonCalendar } from '../src/tracker.ts';
import type { Day, SeasonRecord } from '../src/types.ts';

const DATA_DIR = new URL('../public/nba-belt/data/', import.meta.url);
const CACHE_DIR = join(tmpdir(), 'nba-belt-espn-v1');
const now = new Date();
const cacheBefore = addDays(easternDate(now), -1); // older days are settled

async function fetchDay(date: string): Promise<Day> {
  const file = join(CACHE_DIR, `${date}.json`);
  if (date < cacheBefore) {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as Day;
    } catch {
      // not cached yet
    }
  }
  let day: Day | undefined;
  for (let attempt = 1; !day; attempt++) {
    try {
      day = await fetchFromEspn(date);
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  if (date < cacheBefore) await writeFile(file, JSON.stringify(day));
  return day;
}

/** Warms the cache for a season's dates, a few requests at a time. */
async function prefetch(dates: string[], concurrency = 8): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < dates.length) await fetchDay(dates[next++]);
    }),
  );
}

/** Sanity checks: the belt passes in an unbroken chain, and every transfer was a holder loss. */
function check(rec: SeasonRecord): void {
  let holder = rec.startingHolder;
  let last = '';
  for (const t of rec.transfers) {
    const loser = t.home.score < t.away.score ? t.home.team : t.away.team;
    const winner = loser === t.home.team ? t.away.team : t.home.team;
    if (t.from !== holder || loser !== holder || winner !== t.to || t.date <= last) {
      throw new Error(`${rec.season}: bad transfer ${JSON.stringify(t)}`);
    }
    holder = t.to;
    last = t.date;
  }
  if (holder !== rec.holder) throw new Error(`${rec.season}: chain ends at ${holder}, holder is ${rec.holder}`);
}

async function backfill(season: number): Promise<SeasonRecord | null> {
  await prefetch(await seasonCalendar(season, fetchDay));
  const rec = await advanceSeason(await newSeasonRecord(season, fetchDay, now), {
    fetchDay,
    now,
    maxFetches: Infinity,
  });
  if (!rec.startedAt) return null;
  check(rec);
  return rec;
}

await mkdir(CACHE_DIR, { recursive: true });
await mkdir(DATA_DIR, { recursive: true });

const currentSeason = (await fetchDay(easternDate(now))).espnSeason - 1;
const args = process.argv.slice(2).map(Number);
const from = args[0] ?? FIRST_SEASON;
const to = args[1] ?? args[0] ?? currentSeason;

for (let season = from; season <= to; season++) {
  const rec = await backfill(season);
  if (!rec) {
    console.log(`${season}: hasn't started, skipped`);
    continue;
  }
  await writeFile(new URL(`${season}.json`, DATA_DIR), JSON.stringify(rec, null, 2) + '\n');
  console.log(
    `${season}: ${rec.startingHolder} → ${rec.holder}, ${rec.transfers.length} transfers, ${rec.status}` +
      (rec.nextGame ? `, next ${rec.nextGame.away}@${rec.nextGame.home}` : ''),
  );
}

const seasons = (await readdir(DATA_DIR))
  .map((f) => /^(\d{4})\.json$/.exec(f)?.[1])
  .filter((s): s is string => s !== undefined)
  .map(Number)
  .sort((a, b) => b - a);
await writeFile(new URL('index.json', DATA_DIR), JSON.stringify({ seasons }) + '\n');
console.log(`index.json: ${seasons.join(', ')}`);
