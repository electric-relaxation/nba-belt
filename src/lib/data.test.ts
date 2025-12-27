import { describe, expect, it } from "vitest";
import { getBeltDataWithDeps } from "./data";

const makeCache = () => {
  const store = new Map<string, Response>();
  return {
    async match(request: Request) {
      const response = store.get(request.url);
      return response ? response.clone() : undefined;
    },
    async put(request: Request, response: Response) {
      store.set(request.url, response.clone());
    },
  };
};

const makeReadGames = (payload: unknown[]) => {
  let calls = 0;
  const readGames = async () => {
    calls += 1;
    return payload;
  };
  return { readGames, getCalls: () => calls };
};

describe("getBeltDataWithDeps", () => {
  it("caches belt data after the first fetch", async () => {
    const apiPayload = [
      {
        id: 1,
        date: "2025-10-01T00:00:00Z",
        status: "Final",
        postseason: false,
        home_team_score: 90,
        visitor_team_score: 100,
        home_team: { abbreviation: "OKC" },
        visitor_team: { abbreviation: "BOS" },
      },
      {
        id: 2,
        date: "2025-10-05T00:00:00Z",
        status: "Scheduled",
        postseason: false,
        home_team_score: null,
        visitor_team_score: null,
        home_team: { abbreviation: "BOS" },
        visitor_team: { abbreviation: "NYK" },
      },
    ];

    const cache = makeCache();
    const { readGames, getCalls } = makeReadGames(apiPayload);

    const first = await getBeltDataWithDeps({
      seasonStartYear: 2025,
      nowUtcIso: "2025-10-02T00:00:00Z",
      readGames,
      cache,
    });

    const second = await getBeltDataWithDeps({
      seasonStartYear: 2025,
      nowUtcIso: "2025-10-02T00:00:00Z",
      readGames,
      cache,
    });

    expect(getCalls()).toBe(1);
    expect(first.currentHolder.abbr).toBe("BOS");
    expect(first.transfers).toHaveLength(1);
    expect(first.nextGame?.homeTeam.abbr).toBe("BOS");
    expect(second.currentHolder.abbr).toBe("BOS");
  });
});
