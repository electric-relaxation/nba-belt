import fs from "node:fs/promises";
import path from "node:path";

const STARTING_HOLDERS_PATH = path.join(
  process.cwd(),
  "data",
  "starting-holders.json",
);

let cachedHolders: Record<string, string> | null = null;

const readStartingHolders = async (): Promise<Record<string, string>> => {
  if (cachedHolders) {
    return cachedHolders;
  }

  let raw = "";
  try {
    raw = await fs.readFile(STARTING_HOLDERS_PATH, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      throw new Error(`Starting holders file missing: ${STARTING_HOLDERS_PATH}.`);
    }
    throw error;
  }

  if (!raw.trim()) {
    throw new Error(`Starting holders file is empty: ${STARTING_HOLDERS_PATH}.`);
  }

  let parsed: unknown;
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

  cachedHolders = parsed as Record<string, string>;
  return cachedHolders;
};

export const getStartingHolderAbbr = async (
  seasonStartYear: number,
): Promise<string> => {
  const holders = await readStartingHolders();
  const holder = holders[String(seasonStartYear)];
  if (!holder) {
    throw new Error(`Starting holder not configured for season ${seasonStartYear}.`);
  }
  return holder;
};
