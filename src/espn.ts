// Reads ESPN's public (unofficial, undocumented) NBA scoreboard API.
// Everything that depends on ESPN's JSON shape lives in this file.

import teams from '../public/nba-belt/teams.json' with { type: 'json' };
import type { Day, Game, Side, TeamCode } from './types.ts';

// Two hostnames serve identical data. ESPN's bot filter blocks most server-side requests to
// site.api.espn.com but lets them through on site.web.api.espn.com, so that one goes first.
const SCOREBOARDS = [
  'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
];

const CODE_BY_ESPN_ID: Record<string, TeamCode> = Object.fromEntries(
  Object.entries(teams).map(([code, team]) => [team.espnId, code]),
);

/** Fetches one day's scoreboard. `date` is YYYYMMDD (US Eastern). */
export async function fetchDay(date: string): Promise<Day> {
  const failures: string[] = [];
  for (const url of SCOREBOARDS) {
    const res = await fetch(`${url}?dates=${date}`);
    if (res.ok) return parseScoreboard((await res.json()) as EspnScoreboard);
    failures.push(`${new URL(url).hostname} ${res.status}`);
    await res.body?.cancel();
  }
  throw new Error(`ESPN scoreboard ${date}: ${failures.join(', ')}`);
}

// The parts of ESPN's response we read. All optional: the API is unofficial.
interface EspnScoreboard {
  leagues?: { season?: { year?: number }; calendar?: unknown[] }[];
  events?: EspnEvent[];
}
interface EspnEvent {
  id: string;
  date: string;
  season?: { year?: number; type?: number };
  competitions?: {
    type?: { abbreviation?: string };
    notes?: { headline?: string }[];
    status?: { type?: { name?: string; state?: string; completed?: boolean; shortDetail?: string; detail?: string } };
    competitors?: EspnCompetitor[];
  }[];
}
interface EspnCompetitor {
  homeAway?: string;
  winner?: boolean;
  score?: string | { value?: number };
  team?: { id?: string };
}

const INACTIVE = /POSTPONED|CANCELED|CANCELLED|SUSPENDED|FORFEIT/;

export function parseScoreboard(json: EspnScoreboard): Day {
  const league = json.leagues?.[0];
  const calendar = (league?.calendar ?? [])
    .filter((d): d is string => typeof d === 'string')
    .map((d) => d.slice(0, 10).replaceAll('-', '')) // "2025-06-22T07:00Z" -> "20250622"
    .sort();
  return { espnSeason: league?.season?.year ?? 0, games: (json.events ?? []).map(parseEvent), calendar };
}

function parseEvent(event: EspnEvent): Game {
  const comp = event.competitions?.[0] ?? {};
  const status = comp.status?.type ?? {};
  const notes = (comp.notes ?? []).map((n) => n.headline ?? '');
  const type = comp.type?.abbreviation ?? '';
  const seasonType = event.season?.type ?? 0;
  const home = parseSide(comp.competitors, 'home');
  const away = parseSide(comp.competitors, 'away');
  const postponed = INACTIVE.test(status.name ?? '');
  const completed = status.completed === true && status.state === 'post' && !postponed;
  if (completed && !home.winner && !away.winner && home.score !== null && away.score !== null) {
    home.winner = home.score > away.score;
    away.winner = away.score > home.score;
  }
  return {
    id: event.id,
    date: new Date(event.date).toISOString(),
    espnSeason: event.season?.year ?? 0,
    seasonType,
    // ESPN tags the Cup final as competition type "CC" ("Commissioner's Cup").
    cupFinal: type === 'CC' || notes.some((n) => /(cup|tournament).*championship/i.test(n)),
    nbaFinals: seasonType === 3 && (type === 'FINAL' || notes.some((n) => /^NBA Finals/i.test(n))),
    home,
    away,
    state: status.state === 'in' || status.state === 'post' ? status.state : 'pre',
    final: completed && home.winner !== away.winner,
    postponed,
    detail: status.shortDetail ?? status.detail ?? '',
  };
}

function parseSide(competitors: EspnCompetitor[] = [], homeAway: 'home' | 'away'): Side {
  const c = competitors.find((x) => x.homeAway === homeAway);
  const raw = typeof c?.score === 'object' ? c.score.value : c?.score;
  const score = raw === undefined || raw === '' ? NaN : Number(raw);
  return {
    team: CODE_BY_ESPN_ID[c?.team?.id ?? ''] ?? null,
    score: Number.isFinite(score) ? score : null,
    winner: c?.winner === true,
  };
}
