import { describe, expect, it } from "vitest";

import { isAllowed } from "./whitelist.ts";

describe("isAllowed", () => {
  it("accepts only ids present in the whitelist", () => {
    expect(isAllowed("1001", ["1001", "1002"])).toBe(true);
    expect(isAllowed("1003", ["1001", "1002"])).toBe(false);
    expect(isAllowed("1001", [])).toBe(false);
  });
});
