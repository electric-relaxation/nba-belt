import { describe, expect, it } from "vitest";
import {
  mergeGames,
  serializeGamesPayload,
  sortGamesByDateThenId,
} from "./update-games.mjs";

describe("mergeGames", () => {
  it("does not mark changes when updates are identical", () => {
    const existing = [
      { id: 1, home_team_score: 100, visitor_team_score: 90 },
    ];
    const updates = [
      { visitor_team_score: 90, home_team_score: 100, id: 1 },
    ];

    const result = mergeGames(existing, updates);

    expect(result.hasChanges).toBe(false);
    expect(result.mergedGames).toEqual(existing);
  });

  it("marks changes when new or updated games arrive", () => {
    const existing = [
      { id: 1, home_team_score: 100, visitor_team_score: 90 },
    ];
    const updates = [
      { id: 1, home_team_score: 101, visitor_team_score: 90 },
      { id: 2, home_team_score: 110, visitor_team_score: 105 },
    ];

    const result = mergeGames(existing, updates);

    expect(result.hasChanges).toBe(true);
    expect(result.mergedGames).toHaveLength(2);
  });

  it("is idempotent when merging identical inputs", () => {
    const season = 2024;
    const fetchedAtUtc = "2024-10-01T00:00:00.000Z";
    const existing = [
      { id: 2, date: "2024-10-02T01:00:00Z", home_team_score: 100 },
      { date: "2024-10-01T00:00:00Z", home_team_score: 110, id: 1 },
    ];
    const updates = [
      { id: 1, home_team_score: 110, date: "2024-10-01T00:00:00Z" },
      { date: "2024-10-02T01:00:00Z", home_team_score: 100, id: 2 },
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
});
