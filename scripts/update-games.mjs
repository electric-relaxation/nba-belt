import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://api.balldontlie.io/v1/games";
const PER_PAGE = 100;
const MIN_DELAY_MS = 13000;
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;
const STARTING_HOLDERS_PATH = path.join(
  process.cwd(),
  "data",
  "starting-holders.json",
);

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
const buildRecentDates = (now = new Date()) => {
  const yesterday = addDays(now, -1);
  const recentDates = [formatDate(yesterday), formatDate(now)];
  const extendedDates = [...recentDates];
  for (let offset = 1; offset <= 7; offset += 1) {
    extendedDates.push(formatDate(addDays(now, offset)));
  }
  return { recentDates, extendedDates };
};
const normalizeGameDate = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.slice(0, 10);
};

const readStartingHolders = async () => {
  let raw = "";
  try {
    raw = await fs.readFile(STARTING_HOLDERS_PATH, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`Starting holders file missing: ${STARTING_HOLDERS_PATH}.`);
    }
    throw error;
  }

  if (!raw.trim()) {
    throw new Error(`Starting holders file is empty: ${STARTING_HOLDERS_PATH}.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Starting holders file has invalid JSON: ${STARTING_HOLDERS_PATH}.`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Starting holders file has unexpected shape: ${STARTING_HOLDERS_PATH}.`,
    );
  }

  return parsed;
};

const getStartingHolderAbbr = async (seasonStartYear) => {
  const holders = await readStartingHolders();
  const holder = holders[String(seasonStartYear)];
  if (!holder) {
    throw new Error(
      `Starting holder not configured for season ${seasonStartYear}.`,
    );
  }
  return holder;
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

const fetchGamesForDates = async (season, apiKey, dates) => {
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

const fetchProbeGames = async (season, apiKey, dates) => {
  const url = buildUrl(season, dates, null);
  const response = await fetchWithBackoff(url, apiKey);

  if (!response.ok) {
    throw new Error(
      `Failed to probe recent games for season ${season}: ${response.status} ${response.statusText}`,
    );
  }

  const payload = await response.json();
  if (!Array.isArray(payload.data)) {
    throw new Error("Unexpected response while probing recent games.");
  }

  return payload.data;
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

const completedStatuses = new Set(["final", "completed"]);

const isCompletedStatus = (status) => {
  if (typeof status !== "string") {
    return false;
  }
  return completedStatuses.has(status.toLowerCase());
};

const isFinalStatus = (status) => {
  if (typeof status !== "string") {
    return false;
  }
  return status.toLowerCase() === "final";
};

const ensureDateIso = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`Invalid game date from API: ${value}`);
  }
  return parsed.toISOString();
};

const normalizeScore = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
};

const mapApiGame = (game) => {
  const status = game?.status ?? "";
  const startTimeSource = game?.datetime ?? game?.date;
  const isCompleted = isCompletedStatus(status);
  return {
    gameId: game?.id,
    startTimeUtc: ensureDateIso(startTimeSource),
    homeTeamAbbr: game?.home_team?.abbreviation ?? "",
    awayTeamAbbr: game?.visitor_team?.abbreviation ?? "",
    homeScore: isCompleted ? normalizeScore(game?.home_team_score) : null,
    awayScore: isCompleted ? normalizeScore(game?.visitor_team_score) : null,
    status,
    isRegularSeason: !game?.postseason,
  };
};

const isCompletedGame = (game) => {
  if (game.status) {
    return isCompletedStatus(game.status);
  }
  return typeof game.homeScore === "number" && typeof game.awayScore === "number";
};

const isRegularSeasonGame = (game) => game.isRegularSeason !== false;

const byStartTimeThenId = (a, b) => {
  const timeDiff = Date.parse(a.startTimeUtc) - Date.parse(b.startTimeUtc);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return String(a.gameId).localeCompare(String(b.gameId));
};

export const computeCurrentHolder = (games, startingHolderAbbr) => {
  const completedGames = games
    .filter((game) => isRegularSeasonGame(game) && isCompletedGame(game))
    .slice()
    .sort(byStartTimeThenId);

  let holder = startingHolderAbbr;

  for (const game of completedGames) {
    const isHolderHome = game.homeTeamAbbr === holder;
    const isHolderAway = game.awayTeamAbbr === holder;

    if (!isHolderHome && !isHolderAway) {
      continue;
    }

    if (game.homeScore === null || game.awayScore === null) {
      continue;
    }

    const winnerAbbr =
      game.homeScore > game.awayScore ? game.homeTeamAbbr : game.awayTeamAbbr;

    if (winnerAbbr !== holder) {
      holder = winnerAbbr;
    }
  }

  return holder;
};

export const hasFutureGameForHolder = (games, holderAbbr, nowUtcIso) => {
  const nowMs = Date.parse(nowUtcIso);
  return games.some((game) => {
    if (!isRegularSeasonGame(game)) {
      return false;
    }
    if (game.homeTeamAbbr !== holderAbbr && game.awayTeamAbbr !== holderAbbr) {
      return false;
    }
    return Date.parse(game.startTimeUtc) > nowMs;
  });
};

export const computeNextGameForHolder = (games, holderAbbr, nowUtcIso) => {
  const nowMs = Date.parse(nowUtcIso);
  const holderGames = games.filter(
    (game) => game.homeTeamAbbr === holderAbbr || game.awayTeamAbbr === holderAbbr,
  );
  const inProgressGame =
    holderGames
      .filter(
        (game) =>
          isRegularSeasonGame(game) &&
          Date.parse(game.startTimeUtc) <= nowMs &&
          !isCompletedGame(game),
      )
      .slice()
      .sort(byStartTimeThenId)[0] ?? null;
  const nextGame =
    inProgressGame ??
    holderGames
      .filter(
        (game) =>
          isRegularSeasonGame(game) && Date.parse(game.startTimeUtc) > nowMs,
      )
      .slice()
      .sort(byStartTimeThenId)[0] ??
    null;
  return nextGame;
};

const shouldApplyUpdate = (existingGame, update) => {
  if (!existingGame) {
    return true;
  }
  return isFinalStatus(update?.status);
};

export const sortGamesByDateThenId = (games) => {
  return [...games].sort((a, b) => {
    const dateA = typeof a?.date === "string" ? a.date : "";
    const dateB = typeof b?.date === "string" ? b.date : "";
    if (dateA < dateB) {
      return -1;
    }
    if (dateA > dateB) {
      return 1;
    }

    const idA = Number(a?.id);
    const idB = Number(b?.id);
    const idAValid = Number.isFinite(idA);
    const idBValid = Number.isFinite(idB);
    if (idAValid && idBValid && idA !== idB) {
      return idA - idB;
    }
    if (idAValid !== idBValid) {
      return idAValid ? -1 : 1;
    }

    const idAString = String(a?.id ?? "");
    const idBString = String(b?.id ?? "");
    return idAString.localeCompare(idBString);
  });
};

export const serializeGamesPayload = (season, fetchedAtUtc, games) => {
  const normalizedGames = games.map((game) => normalizeValue(game));
  const payload = {
    season,
    fetchedAtUtc,
    games: normalizedGames,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
};

export const mergeGames = (existingGames, updates) => {
  const updatesById = new Map(updates.map((game) => [game.id, game]));
  const existingIds = new Set(existingGames.map((game) => game.id));
  let hasChanges = false;

  const mergedGames = existingGames.map((game) => {
    const update = updatesById.get(game.id);
    if (!update) {
      return game;
    }
    if (!shouldApplyUpdate(game, update)) {
      return game;
    }
    if (!hasChanges && stableStringify(game) !== stableStringify(update)) {
      hasChanges = true;
    }
    return update;
  });

  for (const game of updates) {
    if (!existingIds.has(game.id)) {
      if (!shouldApplyUpdate(null, game)) {
        continue;
      }
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

  const existingGames = existingPayload.games;
  const startingHolderAbbr = await getStartingHolderAbbr(season);
  const mappedExistingGames = existingGames.map(mapApiGame);
  const currentHolderAbbr = computeCurrentHolder(
    mappedExistingGames,
    startingHolderAbbr,
  );
  const nowUtcIso = new Date().toISOString();

  const nextGame = computeNextGameForHolder(
    mappedExistingGames,
    currentHolderAbbr,
    nowUtcIso,
  );
  if (!nextGame) {
    console.log("No next holder game found; skipping update.");
    return;
  }

  const nextGameDate = normalizeGameDate(nextGame.startTimeUtc);
  const probeGames = await fetchProbeGames(season, apiKey, [nextGameDate]);
  const probedNext = probeGames.find((game) => game?.id === nextGame.gameId);
  if (!probedNext) {
    console.log("Next holder game not found in probe; skipping update.");
    return;
  }

  if (!isFinalStatus(probedNext.status)) {
    console.log("Next holder game not final; skipping update.");
    return;
  }

  const existing = existingGames.find((game) => game?.id === nextGame.gameId);
  if (existing && isFinalStatus(existing.status)) {
    console.log("Next holder game already final; skipping update.");
    return;
  }

  const { recentDates, extendedDates } = buildRecentDates();
  const recentProbeGames = await fetchProbeGames(season, apiKey, recentDates);
  const hasExistingRecentGames = existingGames.some((game) => {
    const gameDate = normalizeGameDate(game?.date);
    return gameDate && recentDates.includes(gameDate);
  });

  if (recentProbeGames.length === 0 && !hasExistingRecentGames) {
    console.log("No recent games; skipping update");
    return;
  }

  const updates = await fetchGamesForDates(season, apiKey, extendedDates);
  const { mergedGames } = mergeGames(existingGames, updates);
  const sortedMergedGames = sortGamesByDateThenId(mergedGames);
  const sortedExistingGames = sortGamesByDateThenId(existingGames);
  const gamesChanged =
    stableStringify(sortedMergedGames) !== stableStringify(sortedExistingGames);

  if (!gamesChanged) {
    console.log("No new game data found; leaving file unchanged.");
    return;
  }

  const output = serializeGamesPayload(
    season,
    new Date().toISOString(),
    sortedMergedGames,
  );

  await fs.writeFile(filePath, output);
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
