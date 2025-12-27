import { describe, expect, it } from "vitest";
import { getTeamDisplay, logoUrlFromAbbr } from "./teams";

describe("teams helpers", () => {
  it("returns a display record with a normalized abbr", () => {
    const display = getTeamDisplay("lal");

    expect(display.abbr).toBe("LAL");
    expect(display.name).toBe("Los Angeles Lakers");
    expect(display.logoUrl).toBe(
      "https://cdn.nba.com/logos/nba/LAL/global/L/logo.svg",
    );
  });

  it("uses logo overrides when present", () => {
    expect(logoUrlFromAbbr("UTA")).toBe(
      "https://cdn.nba.com/logos/nba/UTA/global/D/logo.svg",
    );
  });

  it("falls back to the normalized abbreviation when name is missing", () => {
    const display = getTeamDisplay("XYZ");

    expect(display.name).toBe("XYZ");
  });
});
