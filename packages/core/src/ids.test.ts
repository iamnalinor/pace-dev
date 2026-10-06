import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { autoOutcomeId, createIdFactory, instanceId, isUlid, newId } from "./ids.ts";

describe("newId", () => {
  it("returns a valid ULID", () => {
    expect(isUlid(newId())).toBe(true);
  });

  it("is monotonic within the same millisecond", () => {
    const make = createIdFactory();
    const ids = Array.from({ length: 50 }, () => make(1_700_000_000_000));
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("accepts an injected PRNG for deterministic tests", () => {
    const a = createIdFactory(() => 0.5)(1_700_000_000_000);
    const b = createIdFactory(() => 0.5)(1_700_000_000_000);
    expect(a).toBe(b);
  });
});

describe("isUlid", () => {
  it("accepts generated ids", () => {
    fc.assert(
      fc.property(fc.integer({ max: 2_000_000_000_000, min: 0 }), (seed) => {
        expect(isUlid(newId(seed))).toBe(true);
      }),
    );
  });

  it("rejects garbage", () => {
    expect(isUlid("")).toBe(false);
    expect(isUlid("hw:p:2026-W41")).toBe(false);
    expect(isUlid("01ARZ3NDEKTSV4RRFFQ69G5FA")).toBe(false);
  });
});

describe("deterministic ids", () => {
  it("builds homework instance ids", () => {
    expect(instanceId("preset-1", "2026-W41")).toBe("hw:preset-1:2026-W41");
  });

  it("builds auto outcome ids", () => {
    expect(autoOutcomeId("task-1", "missed")).toBe("auto:task-1:missed");
    expect(autoOutcomeId("task-1", "skipped")).toBe("auto:task-1:skipped");
  });
});
