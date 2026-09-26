/** The NBA's three-letter team code, e.g. "NYK". */
export type TeamCode = string;

/** One game, parsed from an ESPN scoreboard. */
export interface Game {
  id: string;
  /** Scheduled start time (ISO 8601, UTC). */
  date: string;
  /** ESPN's season year: the year the season ends (2026 for the 2025–26 season). */
  espnSeason: number;
  /** ESPN season type: 1 preseason, 2 regular season, 3 playoffs, 5 play-in. */
  seasonType: number;
  /** NBA Cup championship game. ESPN files it under the regular season, but it doesn't count. */
  cupFinal: boolean;
  /** NBA Finals game. */
  nbaFinals: boolean;
  home: Side;
  away: Side;
  state: 'pre' | 'in' | 'post';
  /** Completed, with a winner. */
  final: boolean;
  /** Postponed, canceled, or suspended. */
  postponed: boolean;
  /** Short status text, e.g. "Q3 5:32", "Halftime", "Final/OT". */
  detail: string;
}

export interface Side {
  /** null for teams that aren't one of the 30 NBA teams (e.g. All-Star teams). */
  team: TeamCode | null;
  score: number | null;
  winner: boolean;
}

/** One day's scoreboard. */
export interface Day {
  /** ESPN season year the date belongs to. */
  espnSeason: number;
  games: Game[];
  /** Every date (YYYYMMDD, US Eastern) with games in that season, in order. */
  calendar: string[];
}

export type FetchDay = (date: string) => Promise<Day>;

/** A game in which the belt changed hands. */
export interface Transfer {
  gameId: string;
  date: string;
  home: { team: TeamCode; score: number };
  away: { team: TeamCode; score: number };
  from: TeamCode;
  to: TeamCode;
}

export interface NextGame {
  gameId: string;
  date: string;
  home: TeamCode;
  away: TeamCode;
  /** Present while the game is being played. */
  live?: { homeScore: number; awayScore: number; detail: string };
}

/** Everything the site knows about one season. Stored in KV and in public/nba-belt/data/. */
export interface SeasonRecord {
  /** Start year: 2025 means the 2025–26 season. */
  season: number;
  status: 'in_progress' | 'final';
  /** Last season's champion, who held the belt on opening night. */
  startingHolder: TeamCode;
  holder: TeamCode;
  /** Games the current holder has won since taking the belt. */
  defenses: number;
  /** Oldest first. */
  transfers: Transfer[];
  /** Start time of the season's first regular-season game, once reached. */
  startedAt: string | null;
  /** The holder's live or next regular-season game. */
  nextGame: NextGame | null;
  /** When upcoming dates were last scanned for the next game (re-checked every 30 minutes). */
  lookaheadAt?: string;
  /** Next US-Eastern date (YYYYMMDD) to check. Every holder game before it has been counted. */
  cursor: string;
  /** When this record was last refreshed from ESPN. */
  updatedAt: string;
}
