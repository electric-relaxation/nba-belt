// One cron run: refresh the tracked season, and start the next season on its opening day.

import { isBeltGame } from './belt.ts';
import { easternDate } from './time.ts';
import { advanceSeason, newSeasonRecord } from './tracker.ts';
import type { Day, FetchDay, SeasonRecord } from './types.ts';

/** Where season records live (KV in production, a Map in tests). */
export interface Store {
  /** The season the site is following (the homepage default). */
  trackedSeason(): Promise<number>;
  setTrackedSeason(season: number): Promise<void>;
  getRecord(season: number): Promise<SeasonRecord | null>;
  putRecord(record: SeasonRecord): Promise<void>;
}

export async function runUpdate(store: Store, fetchDay: FetchDay, now: Date): Promise<SeasonRecord> {
  const fetch = memoize(fetchDay);
  const season = await store.trackedSeason();
  const stored = await store.getRecord(season);
  if (!stored) throw new Error(`No record for the ${season} season`);

  let record = await advanceSeason(stored, { fetchDay: fetch, now });

  // The offseason shows last season's final results until the next regular season begins.
  if (record.status === 'final' && (await nextSeasonStartsToday(record.season, fetch, now))) {
    await store.putRecord(record);
    const fresh = await newSeasonRecord(record.season + 1, fetch, now);
    record = await advanceSeason(fresh, { fetchDay: fetch, now, maxFetches: 3 });
    await store.setTrackedSeason(record.season);
  }

  await store.putRecord(record);
  return record;
}

async function nextSeasonStartsToday(season: number, fetchDay: FetchDay, now: Date): Promise<boolean> {
  const today = await fetchDay(easternDate(now));
  return today.games.some((g) => isBeltGame(g, season + 1));
}

function memoize(fetchDay: FetchDay): FetchDay {
  const cache = new Map<string, Promise<Day>>();
  return (date) => {
    let day = cache.get(date);
    if (!day) {
      day = fetchDay(date);
      cache.set(date, day);
    }
    return day;
  };
}
