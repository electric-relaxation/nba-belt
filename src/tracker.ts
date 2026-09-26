// Keeps a season record up to date by walking ESPN's daily scoreboards.
// The cron runs advanceSeason() every 2 minutes; the backfill script runs it once per past season.

import { applyResult, holderGame, isBeltGame, toNextGame } from './belt.ts';
import { addDays, easternDate } from './time.ts';
import type { Day, FetchDay, Game, NextGame, SeasonRecord, TeamCode } from './types.ts';

/** How many upcoming game dates to scan for the holder's next game. */
const LOOKAHEAD_DATES = 8;
/** A game still unfinished this long after its scheduled start is treated as never played. */
const STALE_MS = 2 * 24 * 60 * 60 * 1000;

export interface AdvanceOptions {
  fetchDay: FetchDay;
  now: Date;
  /** Most scoreboards to fetch in one run (keeps cron runs within the Worker's CPU limit). */
  maxFetches?: number;
}

/**
 * Brings a season record up to date as of `now`: counts finished holder games,
 * finds the holder's live or next game, and marks the season final once the
 * regular season is over. Returns a new record.
 */
export async function advanceSeason(input: SeasonRecord, options: AdvanceOptions): Promise<SeasonRecord> {
  const { now, maxFetches = 6 } = options;
  const rec = structuredClone(input);
  const today = easternDate(now);

  const days = new Map<string, Day>();
  let fetchesLeft = maxFetches;
  const getDay = async (date: string): Promise<Day | null> => {
    const cached = days.get(date);
    if (cached) return cached;
    if (fetchesLeft <= 0) return null;
    fetchesLeft -= 1;
    const day = await options.fetchDay(date);
    days.set(date, day);
    return day;
  };

  // 1. Count holder games from the cursor through today, one game date at a time.
  let pending: Game | undefined;
  let seasonOver = false;
  while (rec.cursor <= today) {
    const day = await getDay(rec.cursor);
    if (!day) break; // out of fetches; the next run continues from here
    if (isAfterRegularSeason(day, rec.season)) {
      seasonOver = true;
      break;
    }
    noteSeasonStart(rec, day.games);
    const game = holderGame(day.games, rec);
    if (game && !game.final && !isStale(game, now)) {
      pending = game; // live now, or later today
      break;
    }
    if (game?.final) applyResult(rec, game);
    const next = day.calendar.find((d) => d > rec.cursor);
    if (!next) {
      rec.cursor = addDays(rec.cursor, 1);
      seasonOver = true; // no more game dates this season
      break;
    }
    rec.cursor = next;
  }
  const caughtUp = pending !== undefined || seasonOver || rec.cursor > today;

  // 2. Find the holder's next game, and whether any regular-season games remain.
  if (pending) {
    rec.nextGame = toNextGame(pending);
    rec.status = 'in_progress';
  } else if (caughtUp) {
    const ahead = seasonOver ? { sawRegular: false, complete: true } : await lookAhead(rec, getDay, now);
    if (ahead.complete) {
      rec.nextGame = ahead.next ? toNextGame(ahead.next) : null;
      const regularSeasonLeft =
        rec.startedAt === null || // can't be over before it starts
        ahead.next !== undefined ||
        ahead.sawRegular ||
        (rec.status !== 'final' && (await unfinishedToday(rec, today, getDay, now)));
      rec.status = regularSeasonLeft ? 'in_progress' : 'final';
    }
  }
  if (rec.nextGame && !stillAhead(rec.nextGame, rec.holder, now)) rec.nextGame = null;

  rec.updatedAt = now.toISOString();
  return rec;
}

interface Ahead {
  next?: Game;
  /** Saw regular-season games of this season (so it isn't over). */
  sawRegular: boolean;
  /** False if the scan stopped early for lack of fetches. */
  complete: boolean;
}

/** Scans upcoming game dates, starting at the cursor, for the holder's next game. */
async function lookAhead(
  rec: SeasonRecord,
  getDay: (date: string) => Promise<Day | null>,
  now: Date,
): Promise<Ahead> {
  let sawRegular = false;
  let date: string | undefined = rec.cursor;
  for (let i = 0; date !== undefined && i < LOOKAHEAD_DATES; i++) {
    const day = await getDay(date);
    if (!day) return { sawRegular, complete: false };
    if (isAfterRegularSeason(day, rec.season)) break;
    const next = holderGame(day.games, rec);
    if (next && !next.final && !isStale(next, now)) return { next, sawRegular: true, complete: true };
    sawRegular ||= day.games.some((g) => isBeltGame(g, rec.season) && !g.postponed);
    const current: string = date;
    date = day.calendar.find((d) => d > current);
  }
  return { sawRegular, complete: true };
}

/** Whether a regular-season game today hasn't finished yet. The season isn't final until it has. */
async function unfinishedToday(
  rec: SeasonRecord,
  today: string,
  getDay: (date: string) => Promise<Day | null>,
  now: Date,
): Promise<boolean> {
  const day = await getDay(today);
  if (!day) return true;
  return (
    day.espnSeason === rec.season + 1 &&
    day.games.some((g) => isBeltGame(g, rec.season) && !g.final && !g.postponed && !isStale(g, now))
  );
}

/** The date belongs to a later season, or has play-in/playoff games and no regular-season ones. */
function isAfterRegularSeason(day: Day, season: number): boolean {
  if (day.espnSeason > season + 1) return true;
  const postseason = day.games.some((g) => g.seasonType === 3 || g.seasonType === 5);
  return postseason && !day.games.some((g) => isBeltGame(g, season));
}

function noteSeasonStart(rec: SeasonRecord, games: Game[]): void {
  if (rec.startedAt) return;
  const starts = games
    .filter((g) => isBeltGame(g, rec.season) && !g.postponed)
    .map((g) => g.date)
    .sort();
  if (starts.length) rec.startedAt = starts[0];
}

function isStale(game: Game, now: Date): boolean {
  return now.getTime() - Date.parse(game.date) > STALE_MS;
}

/** A stored next game still applies if it involves the holder and hasn't long since started. */
function stillAhead(game: NextGame, holder: TeamCode, now: Date): boolean {
  const involvesHolder = game.home === holder || game.away === holder;
  const recent = game.live !== undefined || Date.parse(game.date) > now.getTime() - 12 * 60 * 60 * 1000;
  return involvesHolder && recent;
}

/** Every game date of a season. Mid-January is always mid-season, so its scoreboard carries the calendar. */
export async function seasonCalendar(season: number, fetchDay: FetchDay): Promise<string[]> {
  const day = await fetchDay(`${season + 1}0115`);
  if (day.espnSeason !== season + 1 || day.calendar.length === 0) {
    throw new Error(`No ESPN calendar for the ${season} season`);
  }
  return day.calendar;
}

/** A season's champion. Its calendar ends on the day the NBA Finals ended. */
export async function findChampion(season: number, fetchDay: FetchDay): Promise<TeamCode> {
  const calendar = await seasonCalendar(season, fetchDay);
  const lastDay = calendar[calendar.length - 1];
  const { games } = await fetchDay(lastDay);
  const clincher = games.find((g) => g.nbaFinals && g.final);
  const champion = clincher && (clincher.home.winner ? clincher.home.team : clincher.away.team);
  if (!champion) throw new Error(`No completed NBA Finals game on ${lastDay} (${season} season)`);
  return champion;
}

/** A new record for a season, with last season's champion holding the belt. */
export async function newSeasonRecord(season: number, fetchDay: FetchDay, now: Date): Promise<SeasonRecord> {
  const [calendar, champion] = await Promise.all([
    seasonCalendar(season, fetchDay),
    findChampion(season - 1, fetchDay),
  ]);
  return {
    season,
    status: 'in_progress',
    startingHolder: champion,
    holder: champion,
    defenses: 0,
    transfers: [],
    startedAt: null,
    nextGame: null,
    cursor: calendar[0],
    updatedAt: now.toISOString(),
  };
}
