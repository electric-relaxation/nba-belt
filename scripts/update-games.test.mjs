import { describe, expect, it } from "vitest";
import { mergeGames } from "./update-games.mjs";

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
});
