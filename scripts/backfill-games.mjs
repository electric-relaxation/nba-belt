import fs from "node:fs/promises";
import path from "node:path";

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
      "Usage: node scripts/backfill-games.mjs <seasonStartYear> or --season <seasonStartYear>",
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

const getSeasonStartDate = (season) => {
  const start = new Date(Date.UTC(season, 9, 1));
  return formatDate(start);
};

const LOOKAHEAD_DAYS = 7;
const getTodayDate = () => formatDate(new Date());
const getLookaheadDate = () => formatDate(addDays(new Date(), LOOKAHEAD_DAYS));

const buildUrl = (season, cursor) => {
  const url = new URL(API_URL);
  url.searchParams.set("seasons[]", String(season));
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("postseason", "false");
  url.searchParams.set("start_date", getSeasonStartDate(season));
  url.searchParams.set("end_date", getLookaheadDate());
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

const main = async () => {
  const season = parseSeasonArg();
  const apiKey = getApiKey();
  const games = [];
  let cursor = null;

  while (true) {
    const url = buildUrl(season, cursor);
    const response = await fetchWithBackoff(url, apiKey);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch games for season ${season}: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json();
    if (!Array.isArray(payload.data)) {
      throw new Error(`Unexpected response while fetching season ${season} games.`);
    }

    for (const game of payload.data) {
      if (game?.ist_stage === "Championship") {
        continue;
      }
      games.push(game);
    }

    const nextCursor = payload.meta?.next_cursor;
    if (!nextCursor) {
      break;
    }

    cursor = nextCursor;
    await sleep(MIN_DELAY_MS);
  }

  const outputPath = path.join(process.cwd(), "data", `games-${season}.json`);
  const output = {
    season,
    fetchedAtUtc: new Date().toISOString(),
    games,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${games.length} games to ${outputPath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
