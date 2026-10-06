import { describe, expect, it } from "vitest";

import { endpoints } from "./endpoints.ts";

describe("endpoints", () => {
  it("declares every path under /api with a unique method+path", () => {
    const seen = new Set<string>();
    for (const definition of Object.values(endpoints)) {
      expect(definition.path.startsWith("/api/")).toBe(true);
      const key = `${definition.method} ${definition.path}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("health is public and answers ok", () => {
    expect(endpoints.health.auth).toBe(false);
    expect(endpoints.health.output.parse({ status: "ok" })).toEqual({ status: "ok" });
    expect(() => endpoints.health.output.parse({ status: "down" })).toThrow();
  });
});
