import { describe, expect, it } from "vitest";
import { getTeamDisplay, logoUrlFromAbbr } from "./teams";

describe("teams helpers", () => {
  it("returns a display record with a normalized abbr", () => {
    const display = getTeamDisplay("lal");

    expect(display.abbr).toBe("LAL");
    expect(display.name).toBe("Los Angeles Lakers");
    expect(display.logoUrl).toBe("/logos/LAL.png");
  });

  it("uses logo overrides when present", () => {
    expect(logoUrlFromAbbr("UTA")).toBe("/logos/UTA.png");
  });

  it("falls back to the normalized abbreviation when name is missing", () => {
    const display = getTeamDisplay("XYZ");

    expect(display.name).toBe("XYZ");
  });
});
