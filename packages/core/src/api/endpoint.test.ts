import { describe, expect, it } from "vitest";

import { buildPath } from "./endpoint.ts";

describe("buildPath", () => {
  it("substitutes and encodes params", () => {
    expect(buildPath("/api/auth/nonce/:nonce", { nonce: "a b/c" })).toBe(
      "/api/auth/nonce/a%20b%2Fc",
    );
  });

  it("leaves unknown params untouched so the mismatch is visible", () => {
    expect(buildPath("/api/tasks/:id", undefined)).toBe("/api/tasks/:id");
  });
});
