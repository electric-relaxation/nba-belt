import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const API_URL = "https://api.balldontlie.io/v1/games";
const PER_PAGE = 1;
const BASE_BACKOFF_MS = 1500;
const MAX_BACKOFF_MS = 20000;
const MAX_RETRIES = 5;

const DATA_DIR = path.join(process.cwd(), "data");
const STARTING_HOLDERS_PATH = path.join(DATA_DIR, "starting-holders.json");
const GAMES_FILE_REGEX = /^games-(\d{4})\.json$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getApiKey = () => {
  const apiKey = process.env.BALLDONTLIE_API_KEY;
  if (!apiKey) {
    console.error("BALLDONTLIE_API_KEY is required.");
    process.exit(1);
  }
  return apiKey;
};

const readAvailableSeasons = async () => {
  const entries = await fs.readdir(DATA_DIR);
  const seasons = entries
    .map((entry) => GAMES_FILE_REGEX.exec(entry))
    .filter((match) => Boolean(match))
    .map((match) => Number.parseInt(match[1], 10))
    .filter((value) => Number.isFinite(value));

  if (seasons.length === 0) {
    throw new Error("No season game files found in data/.");
  }

  return seasons.sort((a, b) => b - a);
};

const readStartingHolders = async () => {
  let raw = "";
  try {
    raw = await fs.readFile(STARTING_HOLDERS_PATH, "utf8");
  } catch (error) {
    if ((error && error.code) === "ENOENT") {
      throw new Error(`Missing ${STARTING_HOLDERS_PATH}.`);
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

const writeStartingHolders = async (holders) => {
  const entries = Object.entries(holders).sort((a, b) => {
    const aNum = Number.parseInt(a[0], 10);
    const bNum = Number.parseInt(b[0], 10);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
      return aNum - bNum;
    }
    return a[0].localeCompare(b[0]);
  });

  const normalized = {};
  for (const [key, value] of entries) {
    normalized[key] = value;
  }

  await fs.writeFile(STARTING_HOLDERS_PATH, `${JSON.stringify(normalized, null, 2)}\n`);
};

const runComputeChampion = async (season) => {
  const scriptPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "compute-champion.mjs",
  );

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [scriptPath, "--season", String(season)],
      { env: process.env, maxBuffer: 1024 * 1024 },
    );
    const lines = stdout.trim().split("\n").filter(Boolean);
    const payload = JSON.parse(lines[lines.length - 1]);
    if (!payload || typeof payload.championAbbr !== "string") {
      throw new Error("compute-champion returned invalid output.");
    }
    return { ok: true, payload };
  } catch (error) {
    const stderr =
      typeof error?.stderr === "string" ? error.stderr : "";
    const stdout =
      typeof error?.stdout === "string" ? error.stdout : "";
    const combined = `${stderr}\n${stdout}`;
    if (combined.includes("Postseason not complete")) {
      return { ok: false, reason: "postseason-incomplete", message: combined.trim() };
    }
    throw new Error(
      combined.trim() || (error instanceof Error ? error.message : String(error)),
    );
  }
};

const computeBackoffMs = (attempt, retryAfterSeconds) => {
  const exponential = Math.min(
    BASE_BACKOFF_MS * 2 ** (attempt - 1),
    MAX_BACKOFF_MS,
  );
  const retryAfterMs = Number.isFinite(retryAfterSeconds)
    ? retryAfterSeconds * 1000
    : 0;
  const jitterMs = Math.floor(Math.random() * 500);
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
    await sleep(computeBackoffMs(attempt, retrySeconds));
  }
};

const probeNextSeasonHasGames = async (season, apiKey) => {
  const url = new URL(API_URL);
  url.searchParams.set("seasons[]", String(season));
  url.searchParams.set("postseason", "false");
  url.searchParams.set("per_page", String(PER_PAGE));

  const response = await fetchWithBackoff(url, apiKey);
  if (!response.ok) {
    throw new Error(
      `Failed to probe season ${season}: ${response.status} ${response.statusText}`,
    );
  }

  const payload = await response.json();
  if (!Array.isArray(payload.data)) {
    throw new Error("Unexpected response while probing for next season games.");
  }

  return payload.data.length > 0;
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  const apiKey = getApiKey();
  const seasons = await readAvailableSeasons();
  const currentSeason = seasons[0];
  const nextSeason = currentSeason + 1;

  const startingHolders = await readStartingHolders();
  if (!startingHolders[String(nextSeason)]) {
    const result = await runComputeChampion(currentSeason);
    if (!result.ok && result.reason === "postseason-incomplete") {
      console.log(
        result.message || "Postseason not complete; champion not determined yet.",
      );
      return;
    }

    const championAbbr = result.payload.championAbbr;
    startingHolders[String(nextSeason)] = championAbbr;
    await writeStartingHolders(startingHolders);
    console.log(
      `Added starting holder for ${nextSeason}: ${championAbbr}.`,
    );
  }

  const nextSeasonPath = path.join(DATA_DIR, `games-${nextSeason}.json`);
  let updateSeason = currentSeason;

  if (await fileExists(nextSeasonPath)) {
    updateSeason = nextSeason;
  } else if (await probeNextSeasonHasGames(nextSeason, apiKey)) {
    const payload = {
      season: nextSeason,
      fetchedAtUtc: new Date().toISOString(),
      games: [],
    };
    await fs.writeFile(nextSeasonPath, `${JSON.stringify(payload, null, 2)}\n`);
    updateSeason = nextSeason;
    console.log(`Created ${nextSeasonPath}.`);
  }

  console.log(`UPDATE_SEASON=${updateSeason}`);
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
