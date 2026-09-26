import { easternDate } from '../src/time.ts';
import type { Day, FetchDay, Game, SeasonRecord } from '../src/types.ts';
import type { Store } from '../src/update.ts';

let lastId = 0;

export interface GameSpec {
  /** Start time, ISO (UTC). */
  date: string;
  home: string | null;
  away: string | null;
  /** Final score; omit for a game not yet played. */
  score?: [home: number, away: number];
  /** 'in' makes it a live game (give `score` for the current score). */
  state?: 'pre' | 'in' | 'post';
  /** ESPN season year (default 2026, i.e. the 2025–26 season). */
  espnSeason?: number;
  /** ESPN season type (default 2, regular season). */
  type?: number;
  cupFinal?: boolean;
  nbaFinals?: boolean;
  postponed?: boolean;
  detail?: string;
}

export function game(spec: GameSpec): Game {
  const state = spec.state ?? (spec.score && !spec.postponed ? 'post' : 'pre');
  const [hs, as] = spec.score ?? [null, null];
  const final = state === 'post' && !spec.postponed && hs !== null && as !== null;
  return {
    id: `g${++lastId}`,
    date: new Date(spec.date).toISOString(),
    espnSeason: spec.espnSeason ?? 2026,
    seasonType: spec.type ?? 2,
    cupFinal: spec.cupFinal ?? false,
    nbaFinals: spec.nbaFinals ?? false,
    home: { team: spec.home, score: hs, winner: final && hs! > as! },
    away: { team: spec.away, score: as, winner: final && as! > hs! },
    state,
    final,
    postponed: spec.postponed ?? false,
    detail: spec.detail ?? '',
  };
}

/**
 * A stand-in for ESPN: each season's calendar is the dates of its games. Like the real API,
 * a date between seasons returns the most recent season's calendar with no games.
 */
export function fakeEspn(games: Game[]): { fetchDay: FetchDay; fetched: string[] } {
  const seasons = new Map<number, Map<string, Game[]>>();
  for (const g of games) {
    const byDate = seasons.get(g.espnSeason) ?? new Map<string, Game[]>();
    const date = easternDate(new Date(g.date));
    byDate.set(date, [...(byDate.get(date) ?? []), g]);
    seasons.set(g.espnSeason, byDate);
  }
  const calendars = [...seasons].map(([espnSeason, byDate]) => ({
    espnSeason,
    byDate,
    calendar: [...byDate.keys()].sort(),
  }));
  const fetched: string[] = [];
  const fetchDay = async (date: string): Promise<Day> => {
    fetched.push(date);
    const season = calendars
      .filter((s) => s.calendar[0] <= date)
      .sort((a, b) => b.calendar[0].localeCompare(a.calendar[0]))[0];
    if (!season) return { espnSeason: 0, games: [], calendar: [] };
    return { espnSeason: season.espnSeason, games: season.byDate.get(date) ?? [], calendar: season.calendar };
  };
  return { fetchDay, fetched };
}

/** A record for the 2025 season with `holder` holding the belt, starting at `cursor`. */
export function record(holder: string, cursor: string, overrides: Partial<SeasonRecord> = {}): SeasonRecord {
  return {
    season: 2025,
    status: 'in_progress',
    startingHolder: holder,
    holder,
    defenses: 0,
    transfers: [],
    startedAt: null,
    nextGame: null,
    cursor,
    updatedAt: '2025-10-01T00:00:00.000Z',
    ...overrides,
  };
}

/** An in-memory Store, as the cron sees KV. */
export function memoryStore(tracked: number, ...records: SeasonRecord[]): Store {
  const saved = new Map(records.map((r) => [r.season, r]));
  let trackedSeason = tracked;
  return {
    trackedSeason: async () => trackedSeason,
    setTrackedSeason: async (season) => {
      trackedSeason = season;
    },
    getRecord: async (season) => saved.get(season) ?? null,
    putRecord: async (rec) => {
      saved.set(rec.season, rec);
    },
  };
}
