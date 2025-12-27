import { describe, expect, it } from "vitest";
import { computeBelt, type BeltGame } from "./belt";

describe("computeBelt", () => {
  it("records transfers and selects the next game for the current holder", () => {
    const games: BeltGame[] = [
      {
        gameId: "1",
        startTimeUtc: "2025-10-01T00:00:00Z",
        homeTeamAbbr: "AAA",
        awayTeamAbbr: "BBB",
        homeScore: 90,
        awayScore: 100,
        status: "Final",
        isRegularSeason: true,
      },
      {
        gameId: "2",
        startTimeUtc: "2025-10-02T00:00:00Z",
        homeTeamAbbr: "CCC",
        awayTeamAbbr: "BBB",
        homeScore: 110,
        awayScore: 102,
        status: "Final",
        isRegularSeason: true,
      },
      {
        gameId: "3",
        startTimeUtc: "2025-10-03T00:00:00Z",
        homeTeamAbbr: "CCC",
        awayTeamAbbr: "AAA",
        homeScore: 99,
        awayScore: 95,
        status: "Final",
        isRegularSeason: true,
      },
      {
        gameId: "4",
        startTimeUtc: "2025-10-04T00:00:00Z",
        homeTeamAbbr: "BBB",
        awayTeamAbbr: "CCC",
        homeScore: null,
        awayScore: null,
        status: "Scheduled",
        isRegularSeason: true,
      },
      {
        gameId: "5",
        startTimeUtc: "2025-10-03T06:00:00Z",
        homeTeamAbbr: "DDD",
        awayTeamAbbr: "EEE",
        homeScore: null,
        awayScore: null,
        status: "Scheduled",
        isRegularSeason: true,
      },
    ];

    const result = computeBelt(games, "AAA", "2025-10-03T12:00:00Z");

    expect(result.currentHolderAbbr).toBe("CCC");
    expect(result.transfers).toHaveLength(2);
    expect(result.transfers[0]).toMatchObject({
      gameId: "1",
      fromAbbr: "AAA",
      toAbbr: "BBB",
      winnerAbbr: "BBB",
    });
    expect(result.transfers[1]).toMatchObject({
      gameId: "2",
      fromAbbr: "BBB",
      toAbbr: "CCC",
      winnerAbbr: "CCC",
    });
    expect(result.nextGame?.gameId).toBe("4");
  });
});
