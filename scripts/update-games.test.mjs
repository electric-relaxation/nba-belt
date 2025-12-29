import { describe, expect, it } from "vitest";
import {
  computeCurrentHolder,
  hasFutureGameForHolder,
  mergeGames,
  serializeGamesPayload,
  sortGamesByDateThenId,
} from "./update-games.mjs";

describe("mergeGames", () => {
  it("does not mark changes when updates are identical", () => {
    const existing = [
      {
        id: 1,
        status: "Final",
        home_team_score: 100,
        visitor_team_score: 90,
      },
    ];
    const updates = [
      {
        visitor_team_score: 90,
        home_team_score: 100,
        id: 1,
        status: "Final",
      },
    ];

    const result = mergeGames(existing, updates);

    expect(result.hasChanges).toBe(false);
    expect(result.mergedGames).toEqual(existing);
  });

  it("marks changes when new or updated games arrive", () => {
    const existing = [
      {
        id: 1,
        status: "Final",
        home_team_score: 100,
        visitor_team_score: 90,
      },
    ];
    const updates = [
      {
        id: 1,
        status: "Final",
        home_team_score: 101,
        visitor_team_score: 90,
      },
      {
        id: 2,
        status: "Scheduled",
        home_team_score: 110,
        visitor_team_score: 105,
      },
    ];

    const result = mergeGames(existing, updates);

    expect(result.hasChanges).toBe(true);
    expect(result.mergedGames).toHaveLength(2);
  });

  it("is idempotent when merging identical inputs", () => {
    const season = 2024;
    const fetchedAtUtc = "2024-10-01T00:00:00.000Z";
    const existing = [
      {
        id: 2,
        status: "Final",
        date: "2024-10-02T01:00:00Z",
        home_team_score: 100,
      },
      {
        date: "2024-10-01T00:00:00Z",
        home_team_score: 110,
        id: 1,
        status: "Final",
      },
    ];
    const updates = [
      {
        id: 1,
        status: "Final",
        home_team_score: 110,
        date: "2024-10-01T00:00:00Z",
      },
      {
        date: "2024-10-02T01:00:00Z",
        home_team_score: 100,
        id: 2,
        status: "Final",
      },
    ];

    const first = mergeGames(existing, updates);
    const firstOutput = serializeGamesPayload(
      season,
      fetchedAtUtc,
      sortGamesByDateThenId(first.mergedGames),
    );

    const second = mergeGames(sortGamesByDateThenId(first.mergedGames), updates);
    const secondOutput = serializeGamesPayload(
      season,
      fetchedAtUtc,
      sortGamesByDateThenId(second.mergedGames),
    );

    expect(second.hasChanges).toBe(false);
    expect(secondOutput).toBe(firstOutput);
  });

  it("ignores non-final updates for existing games", () => {
    const existing = [
      { id: 1, status: "Scheduled", home_team_score: null, visitor_team_score: null },
    ];
    const updates = [
      { id: 1, status: "In Progress", home_team_score: 42, visitor_team_score: 38 },
    ];

    const result = mergeGames(existing, updates);

    expect(result.hasChanges).toBe(false);
    expect(result.mergedGames).toEqual(existing);
  });

  it("applies final updates for existing games", () => {
    const existing = [
      { id: 1, status: "Scheduled", home_team_score: null, visitor_team_score: null },
    ];
    const updates = [
      { id: 1, status: "Final", home_team_score: 102, visitor_team_score: 98 },
    ];

    const result = mergeGames(existing, updates);

    expect(result.hasChanges).toBe(true);
    expect(result.mergedGames).toEqual(updates);
  });
});

describe("current holder checks", () => {
  it("computes the current holder from completed games", () => {
    const games = [
      {
        gameId: 1,
        startTimeUtc: "2024-10-01T00:00:00.000Z",
        homeTeamAbbr: "AAA",
        awayTeamAbbr: "BBB",
        homeScore: 120,
        awayScore: 110,
        status: "Final",
        isRegularSeason: true,
      },
      {
        gameId: 2,
        startTimeUtc: "2024-10-02T00:00:00.000Z",
        homeTeamAbbr: "AAA",
        awayTeamAbbr: "CCC",
        homeScore: 95,
        awayScore: 101,
        status: "Final",
        isRegularSeason: true,
      },
    ];

    const holder = computeCurrentHolder(games, "AAA");

    expect(holder).toBe("CCC");
  });

  it("detects future holder games", () => {
    const games = [
      {
        gameId: 3,
        startTimeUtc: "2024-10-01T10:00:00.000Z",
        homeTeamAbbr: "AAA",
        awayTeamAbbr: "BBB",
        homeScore: null,
        awayScore: null,
        status: "In Progress",
        isRegularSeason: true,
      },
      {
        gameId: 4,
        startTimeUtc: "2024-10-02T10:00:00.000Z",
        homeTeamAbbr: "AAA",
        awayTeamAbbr: "CCC",
        homeScore: null,
        awayScore: null,
        status: "Scheduled",
        isRegularSeason: true,
      },
    ];

    const hasFutureGame = hasFutureGameForHolder(
      games,
      "AAA",
      "2024-10-01T12:00:00.000Z",
    );

    expect(hasFutureGame).toBe(true);
  });

  it("ignores postseason future games for holder checks", () => {
    const games = [
      {
        gameId: 5,
        startTimeUtc: "2024-10-02T10:00:00.000Z",
        homeTeamAbbr: "AAA",
        awayTeamAbbr: "DDD",
        homeScore: null,
        awayScore: null,
        status: "Scheduled",
        isRegularSeason: false,
      },
    ];

    const hasFutureGame = hasFutureGameForHolder(
      games,
      "AAA",
      "2024-10-01T12:00:00.000Z",
    );

    expect(hasFutureGame).toBe(false);
  });
});
