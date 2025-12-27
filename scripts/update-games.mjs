import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://api.balldontlie.io/v1/games";
const PER_PAGE = 100;
const MIN_DELAY_MS = 13000;
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseSeasonArg = () => {
  const args = process.argv.slice(2);
  let seasonValue = args[0];
  const seasonFlagIndex = args.findIndex((arg) => arg === "--season" || arg === "-s");
  if (seasonFlagIndex !== -1) {
    seasonValue = args[seasonFlagIndex + 1];
  }

  const season = Number.parseInt(seasonValue ?? "", 10);
  if (!Number.isFinite(season)) {
    console.error(
      "Usage: node scripts/update-games.mjs <seasonStartYear> or --season <seasonStartYear>",
    );
    process.exit(1);
  }
  return season;
};

const getApiKey = () => {
  const apiKey = process.env.BALLDONTLIE_API_KEY;
  if (!apiKey) {
    console.error("BALLDONTLIE_API_KEY is required.");
    process.exit(1);
  }
  return apiKey;
};

const formatDate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const buildUrl = (season, dates, cursor) => {
  const url = new URL(API_URL);
  url.searchParams.set("seasons[]", String(season));
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("postseason", "false");
  for (const date of dates) {
    url.searchParams.append("dates[]", date);
  }
  if (cursor !== null && cursor !== undefined) {
    url.searchParams.set("cursor", String(cursor));
  }
  return url;
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
    const waitMs = Number.isFinite(retrySeconds)
      ? retrySeconds * 1000
      : BASE_BACKOFF_MS * 2 ** (attempt - 1);

    await sleep(waitMs);
  }
};

const fetchRecentGames = async (season, apiKey) => {
  const now = new Date();
  const yesterday = addDays(now, -1);
  const dates = [formatDate(yesterday), formatDate(now)];
  for (let offset = 1; offset <= 7; offset += 1) {
    dates.push(formatDate(addDays(now, offset)));
  }
  const games = [];
  let cursor = null;

  while (true) {
    const url = buildUrl(season, dates, cursor);
    const response = await fetchWithBackoff(url, apiKey);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch recent games for season ${season}: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json();
    if (!Array.isArray(payload.data)) {
      throw new Error("Unexpected response while fetching recent games.");
    }

    games.push(...payload.data);

    const nextCursor = payload.meta?.next_cursor;
    if (!nextCursor) {
      break;
    }

    cursor = nextCursor;
    await sleep(MIN_DELAY_MS);
  }

  return games;
};

const normalizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === "object") {
    const sortedKeys = Object.keys(value).sort();
    const normalized = {};
    for (const key of sortedKeys) {
      normalized[key] = normalizeValue(value[key]);
    }
    return normalized;
  }
  return value;
};

const stableStringify = (value) => JSON.stringify(normalizeValue(value));

export const mergeGames = (existingGames, updates) => {
  const updatesById = new Map(updates.map((game) => [game.id, game]));
  const existingIds = new Set(existingGames.map((game) => game.id));
  let hasChanges = false;

  const mergedGames = existingGames.map((game) => {
    const update = updatesById.get(game.id);
    if (!update) {
      return game;
    }
    if (!hasChanges && stableStringify(game) !== stableStringify(update)) {
      hasChanges = true;
    }
    return update;
  });

  for (const game of updates) {
    if (!existingIds.has(game.id)) {
      hasChanges = true;
      mergedGames.push(game);
    }
  }

  return { mergedGames, hasChanges };
};

const main = async () => {
  const season = parseSeasonArg();
  const apiKey = getApiKey();
  const filePath = path.join(process.cwd(), "data", `games-${season}.json`);

  const existingRaw = await fs.readFile(filePath, "utf8");
  const existingPayload = JSON.parse(existingRaw);

  if (
    typeof existingPayload !== "object" ||
    existingPayload === null ||
    !Array.isArray(existingPayload.games)
  ) {
    throw new Error(`Invalid games file at ${filePath}`);
  }

  if (
    typeof existingPayload.season === "number" &&
    existingPayload.season !== season
  ) {
    throw new Error(
      `Season mismatch: file has ${existingPayload.season}, expected ${season}`,
    );
  }

  const updates = await fetchRecentGames(season, apiKey);
  const existingGames = existingPayload.games;
  const { mergedGames, hasChanges } = mergeGames(existingGames, updates);

  if (!hasChanges) {
    console.log("No new game data found; leaving file unchanged.");
    return;
  }

  const output = {
    season,
    fetchedAtUtc: new Date().toISOString(),
    games: mergedGames,
  };

  await fs.writeFile(filePath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Merged ${updates.length} games into ${filePath}`);
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
