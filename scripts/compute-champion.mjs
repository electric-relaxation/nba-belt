import path from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://api.balldontlie.io/v1/games";
const PER_PAGE = 100;
const BASE_BACKOFF_MS = 1500;
const MAX_BACKOFF_MS = 20000;
const MAX_RETRIES = 5;
const PAGE_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = () => {
  const args = process.argv.slice(2);
  let seasonValue;
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--season" || arg === "-s") {
      seasonValue = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--force" || arg === "-f") {
      force = true;
      continue;
    }
    if (!seasonValue && !arg.startsWith("-")) {
      seasonValue = arg;
    }
  }

  const season = Number.parseInt(seasonValue ?? "", 10);
  if (!Number.isFinite(season)) {
    console.error(
      "Usage: node scripts/compute-champion.mjs --season <seasonStartYear> [--force]",
    );
    process.exit(1);
  }

  return { season, force };
};

const getApiKey = () => {
  const apiKey = process.env.BALLDONTLIE_API_KEY;
  if (!apiKey) {
    console.error("BALLDONTLIE_API_KEY is required.");
    process.exit(1);
  }
  return apiKey;
};

const buildUrl = (season, cursor) => {
  const url = new URL(API_URL);
  url.searchParams.set("seasons[]", String(season));
  url.searchParams.set("postseason", "true");
  url.searchParams.set("per_page", String(PER_PAGE));
  if (cursor !== null && cursor !== undefined) {
    url.searchParams.set("cursor", String(cursor));
  }
  return url;
};

const computeBackoffMs = (attempt, retryAfterSeconds) => {
  const exponential = Math.min(
    BASE_BACKOFF_MS * 2 ** (attempt - 1),
    MAX_BACKOFF_MS,
  );
  const retryAfterMs = Number.isFinite(retryAfterSeconds)
    ? retryAfterSeconds * 1000
    : 0;
  const jitterMs = Math.floor(Math.random() * 750);
  return Math.max(exponential, retryAfterMs) + jitterMs;
};

const fetchWithBackoff = async (url, apiKey) => {
  let attempt = 0;

  while (true) {
    const response = await fetch(url, {
      headers: {
        Authorization: apiKey,
      },
    });

    if (response.status !== 429) {
      return response;
    }

    attempt += 1;
    if (attempt > MAX_RETRIES) {
      throw new Error("Too many 429 responses from BALLDONTLIE.");
    }

    const retryAfter = response.headers.get("retry-after");
    const retrySeconds = retryAfter ? Number.parseInt(retryAfter, 10) : NaN;
    const waitMs = computeBackoffMs(attempt, retrySeconds);
    await sleep(waitMs);
  }
};

const getGameDate = (game) => {
  const value = game.datetime ?? game.date;
  if (!value) {
    throw new Error("Game is missing a datetime value.");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`Invalid game datetime: ${value}`);
  }
  return parsed;
};

const getComparableGameId = (game) => {
  const numeric = Number.parseInt(String(game.id), 10);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return String(game.id);
};

const compareByDateThenId = (a, b) => {
  if (a.timeMs !== b.timeMs) {
    return a.timeMs - b.timeMs;
  }
  const aId = getComparableGameId(a.game);
  const bId = getComparableGameId(b.game);
  if (typeof aId === "number" && typeof bId === "number") {
    return aId - bId;
  }
  return String(aId).localeCompare(String(bId));
};

export const deriveChampionFromGames = (games) => {
  const completed = games
    .filter((game) => game.status === "Final")
    .map((game) => ({
      game,
      timeMs: getGameDate(game).valueOf(),
    }));

  if (completed.length === 0) {
    throw new Error("No completed postseason games available.");
  }

  completed.sort(compareByDateThenId);
  const latest = completed[completed.length - 1].game;

  if (
    typeof latest.home_team_score !== "number" ||
    typeof latest.visitor_team_score !== "number"
  ) {
    throw new Error("Final game is missing scores.");
  }

  if (latest.home_team_score === latest.visitor_team_score) {
    throw new Error("Final game ended in a tie; champion is unclear.");
  }

  const championAbbr =
    latest.home_team_score > latest.visitor_team_score
      ? latest.home_team.abbreviation
      : latest.visitor_team.abbreviation;

  return { championAbbr, sourceGameId: latest.id };
};

const fetchPostseasonGames = async (season, apiKey) => {
  const games = [];
  let cursor = null;

  while (true) {
    const url = buildUrl(season, cursor);
    const response = await fetchWithBackoff(url, apiKey);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch postseason games for season ${season}: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json();
    if (!Array.isArray(payload.data)) {
      throw new Error("Unexpected response while fetching postseason games.");
    }

    games.push(...payload.data);

    const nextCursor = payload.meta?.next_cursor;
    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
    await sleep(PAGE_DELAY_MS);
  }

  return games;
};

const postseasonInProgress = (games, now) => {
  const nowMs = now.valueOf();
  return games.some((game) => {
    if (game.status === "Final") {
      return false;
    }
    const gameTime = getGameDate(game).valueOf();
    return gameTime > nowMs;
  });
};

const main = async () => {
  const { season, force } = parseArgs();
  const apiKey = getApiKey();
  const games = await fetchPostseasonGames(season, apiKey);

  if (games.length === 0) {
    throw new Error(`No postseason games found for season ${season}.`);
  }

  if (!force && postseasonInProgress(games, new Date())) {
    console.error("Postseason not complete; champion not determined yet.");
    process.exit(1);
  }

  const { championAbbr, sourceGameId } = deriveChampionFromGames(games);
  const output = {
    season,
    championAbbr,
    sourceGameId,
  };

  console.log(JSON.stringify(output));
};

const isMain = () => {
  if (!process.argv[1]) {
    return false;
  }
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
};

if (isMain()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
