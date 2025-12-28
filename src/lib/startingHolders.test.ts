import { describe, expect, it } from "vitest";
import { getStartingHolderAbbr } from "./startingHolders";

describe("getStartingHolderAbbr", () => {
  it("returns the mapped value for known seasons", async () => {
    await expect(getStartingHolderAbbr(2025)).resolves.toBe("OKC");
  });
});
