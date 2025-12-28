import { describe, expect, it } from "vitest";
import { deriveChampionFromGames } from "./compute-champion.mjs";

describe("deriveChampionFromGames", () => {
  it("selects the latest final game by datetime then id", () => {
    const games = [
      {
        id: 10,
        date: "2025-06-10T00:00:00Z",
        status: "Final",
        home_team_score: 100,
        visitor_team_score: 90,
        home_team: { abbreviation: "BOS" },
        visitor_team: { abbreviation: "DAL" },
      },
      {
        id: 11,
        date: "2025-06-12T00:00:00Z",
        status: "Final",
        home_team_score: 95,
        visitor_team_score: 110,
        home_team: { abbreviation: "BOS" },
        visitor_team: { abbreviation: "DAL" },
      },
      {
        id: 12,
        date: "2025-06-12T00:00:00Z",
        status: "Final",
        home_team_score: 120,
        visitor_team_score: 118,
        home_team: { abbreviation: "DAL" },
        visitor_team: { abbreviation: "BOS" },
      },
      {
        id: 13,
        date: "2025-06-14T00:00:00Z",
        status: "Scheduled",
        home_team_score: null,
        visitor_team_score: null,
        home_team: { abbreviation: "DAL" },
        visitor_team: { abbreviation: "BOS" },
      },
    ];

    const result = deriveChampionFromGames(games);

    expect(result).toEqual({ championAbbr: "DAL", sourceGameId: 12 });
  });
});
