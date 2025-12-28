import fs from "node:fs/promises";
import path from "node:path";
import { computeBelt, type BeltGame, type GameId } from "./belt";
import { FALLBACK_SEASON_START_YEARS } from "./seasons";
import { getStartingHolderAbbr } from "./startingHolders";
import { getTeamDisplay, type TeamDisplay } from "./teams";

export type BeltGameDisplay = {
  gameId: GameId;
  startTimeUtc: string;
  status: string;
  homeTeam: TeamDisplay;
  awayTeam: TeamDisplay;
  homeScore: number | null;
  awayScore: number | null;
};

export type BeltTransferDisplay = {
  gameId: GameId;
  startTimeUtc: string;
  fromTeam: TeamDisplay;
  toTeam: TeamDisplay;
  homeTeam: TeamDisplay;
  awayTeam: TeamDisplay;
  homeScore: number;
  awayScore: number;
  winnerTeam: TeamDisplay;
};

export type BeltData = {
  season: number;
  computedAt: string;
  startingHolder: TeamDisplay;
  currentHolder: TeamDisplay;
  nextGame: BeltGameDisplay | null;
  transfers: BeltTransferDisplay[];
};

export type GetBeltDataArgs = {
  seasonStartYear: number;
  nowUtcIso: string;
};

type CacheLike = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

type BallDontLieTeam = {
  abbreviation: string;
};

type BallDontLieGame = {
  id: number;
  date: string;
  datetime?: string | null;
  status: string;
  postseason: boolean;
  home_team_score: number | null;
  visitor_team_score: number | null;
  home_team: BallDontLieTeam;
  visitor_team: BallDontLieTeam;
};

const CACHE_TTL_SECONDS = 600;
const GAMES_FILE_PREFIX = "games-";
const GAMES_FILE_SUFFIX = ".json";
const GAMES_FILE_DIR = "data";
const GAMES_FILE_REGEX = /^games-(\d{4})\.json$/;

export const getDefaultSeasonStartYear = (now: Date): number => {
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  return month >= 9 ? year : year - 1;
};

export const isCurrentSeason = (
  seasonStartYear: number,
  now: Date,
): boolean => {
  return seasonStartYear === getDefaultSeasonStartYear(now);
};

export const getAvailableSeasonStartYears = async (): Promise<number[]> => {
  try {
    const entries = await fs.readdir(path.join(process.cwd(), GAMES_FILE_DIR));
    const seasons = entries
      .map((entry) => GAMES_FILE_REGEX.exec(entry))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => Number.parseInt(match[1], 10))
      .filter((value) => Number.isFinite(value));
    const unique = Array.from(new Set(seasons));
    const sorted = unique.sort((a, b) => b - a);
    return sorted.length > 0 ? sorted : FALLBACK_SEASON_START_YEARS;
  } catch {
    return FALLBACK_SEASON_START_YEARS;
  }
};

const cacheRequestForSeason = (seasonStartYear: number): Request => {
  return new Request(`https://belt-cache.local/belt?season=${seasonStartYear}`);
};

const readCachedBeltData = async (
  cache: CacheLike,
  seasonStartYear: number,
): Promise<BeltData | null> => {
  const request = cacheRequestForSeason(seasonStartYear);
  const response = await cache.match(request);
  if (!response) {
    return null;
  }
  try {
    return (await response.json()) as BeltData;
  } catch {
    return null;
  }
};

const writeCachedBeltData = async (
  cache: CacheLike,
  seasonStartYear: number,
  data: BeltData,
): Promise<void> => {
  const request = cacheRequestForSeason(seasonStartYear);
  const response = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  await cache.put(request, response);
};

const ensureDateIso = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`Invalid game date from API: ${value}`);
  }
  return parsed.toISOString();
};

const normalizeScore = (value: number | null | undefined): number | null => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
};

const mapApiGame = (game: BallDontLieGame): BeltGame => {
  const status = game.status ?? "";
  const startTimeSource = game.datetime ?? game.date;
  const isCompleted =
    status.toLowerCase() === "final" || status.toLowerCase() === "completed";
  return {
    gameId: game.id,
    startTimeUtc: ensureDateIso(startTimeSource),
    homeTeamAbbr: game.home_team.abbreviation,
    awayTeamAbbr: game.visitor_team.abbreviation,
    homeScore: isCompleted ? normalizeScore(game.home_team_score) : null,
    awayScore: isCompleted ? normalizeScore(game.visitor_team_score) : null,
    status,
    isRegularSeason: !game.postseason,
  };
};

const getGamesFilePath = (seasonStartYear: number): string => {
  const filename = `${GAMES_FILE_PREFIX}${seasonStartYear}${GAMES_FILE_SUFFIX}`;
  return path.join(process.cwd(), GAMES_FILE_DIR, filename);
};

export const readSeasonGamesFromFile = async (
  seasonStartYear: number,
): Promise<BallDontLieGame[]> => {
  const filePath = getGamesFilePath(seasonStartYear);
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      throw new Error(
        `Missing games file for season ${seasonStartYear}. Run backfill to create ${filePath}.`,
      );
    }
    throw error;
  }

  if (!raw.trim()) {
    throw new Error(
      `Games file for season ${seasonStartYear} is empty: ${filePath}.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Games file has invalid JSON: ${filePath}.`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { games?: unknown }).games)
  ) {
    throw new Error(`Games file has unexpected shape: ${filePath}.`);
  }

  const payload = parsed as { season?: number; games: BallDontLieGame[] };
  if (typeof payload.season === "number" && payload.season !== seasonStartYear) {
    throw new Error(
      `Games file season mismatch: ${payload.season} (file) vs ${seasonStartYear} (requested).`,
    );
  }

  return payload.games;
};

const buildBeltData = (
  seasonStartYear: number,
  nowUtcIso: string,
  games: BeltGame[],
  startingHolderAbbr: string,
): BeltData => {
  const beltResult = computeBelt(games, startingHolderAbbr, nowUtcIso);

  return {
    season: seasonStartYear,
    computedAt: nowUtcIso,
    startingHolder: getTeamDisplay(startingHolderAbbr),
    currentHolder: getTeamDisplay(beltResult.currentHolderAbbr),
    nextGame: beltResult.nextGame
      ? {
          gameId: beltResult.nextGame.gameId,
          startTimeUtc: beltResult.nextGame.startTimeUtc,
          status: beltResult.nextGame.status,
          homeTeam: getTeamDisplay(beltResult.nextGame.homeTeamAbbr),
          awayTeam: getTeamDisplay(beltResult.nextGame.awayTeamAbbr),
          homeScore: beltResult.nextGame.homeScore,
          awayScore: beltResult.nextGame.awayScore,
        }
      : null,
    transfers: beltResult.transfers.map((transfer) => ({
      gameId: transfer.gameId,
      startTimeUtc: transfer.startTimeUtc,
      fromTeam: getTeamDisplay(transfer.fromAbbr),
      toTeam: getTeamDisplay(transfer.toAbbr),
      homeTeam: getTeamDisplay(transfer.homeAbbr),
      awayTeam: getTeamDisplay(transfer.awayAbbr),
      homeScore: transfer.homeScore,
      awayScore: transfer.awayScore,
      winnerTeam: getTeamDisplay(transfer.winnerAbbr),
    })),
  };
};

const getDefaultCache = (): CacheLike => {
  const cacheApi = (globalThis as { caches?: { default?: CacheLike } }).caches;
  if (!cacheApi?.default) {
    throw new Error("Cache API is unavailable in this runtime.");
  }
  return cacheApi.default;
};

export const getBeltDataWithDeps = async ({
  seasonStartYear,
  nowUtcIso,
  cache,
  readGames,
}: GetBeltDataArgs & {
  cache: CacheLike;
  readGames: (seasonStartYear: number) => Promise<BallDontLieGame[]>;
}): Promise<BeltData> => {
  const cached = await readCachedBeltData(cache, seasonStartYear);
  if (cached) {
    return cached;
  }

  const apiGames = await readGames(seasonStartYear);
  if (apiGames.length === 0) {
    throw new Error(`No games found for season ${seasonStartYear}.`);
  }

  const games = apiGames.map(mapApiGame);
  const startingHolderAbbr = await getStartingHolderAbbr(seasonStartYear);
  const data = buildBeltData(seasonStartYear, nowUtcIso, games, startingHolderAbbr);
  await writeCachedBeltData(cache, seasonStartYear, data);
  return data;
};

export const getBeltData = async (
  args: GetBeltDataArgs,
): Promise<BeltData> => {
  return getBeltDataWithDeps({
    ...args,
    cache: getDefaultCache(),
    readGames: readSeasonGamesFromFile,
  });
};
