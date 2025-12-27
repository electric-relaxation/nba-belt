import { describe, expect, it } from "vitest";
import { getStartingHolderAbbr } from "./startingHolders";

describe("getStartingHolderAbbr", () => {
  it("returns the mapped value for known seasons", () => {
    expect(getStartingHolderAbbr(2025)).toBe("OKC");
  });
});
