import { describe, expect, it } from "vitest";

import { assoc, inBatch, keyIndex, keysWhere } from "./transient.ts";

type Entries = Readonly<Record<string, number>>;

const EVEN = keyIndex<number>((value) => value % 2 === 0);
const byText = (a: string, b: string): number => a.localeCompare(b);

describe("assoc", () => {
  it("copies outside a batch and leaves the map it was given alone", () => {
    const map: Entries = { a: 1 };
    const next = assoc(map, "b", 2);
    expect(next).not.toBe(map);
    expect(map).toEqual({ a: 1 });
    expect(next).toEqual({ a: 1, b: 2 });
  });

  it("in a batch copies a map it did not make once, then writes that copy in place", () => {
    const given: Entries = { a: 1 };
    const [first, second] = inBatch(() => {
      const copy = assoc(given, "b", 2);
      return [copy, assoc(copy, "c", 3)] as const;
    });
    expect(given).toEqual({ a: 1 });
    expect(second).toBe(first);
    expect(second).toEqual({ a: 1, b: 2, c: 3 });
    expect(Object.isFrozen(second)).toBe(true);
  });

  it("keeps `__proto__` an own entry, never the prototype, in a batch as outside it", () => {
    const value = { polluted: true };
    const outside = assoc<object>({}, "__proto__", value);
    const inside = inBatch(() => assoc<object>(assoc<object>({}, "x", {}), "__proto__", value));
    for (const map of [outside, inside]) {
      expect(Object.getPrototypeOf(map)).toBe(Object.prototype);
      expect(Object.hasOwn(map, "__proto__")).toBe(true);
      expect(Object.keys(map)).toContain("__proto__");
    }
  });

  it("an inner batch's maps are not the outer batch's to write: it copies them", () => {
    inBatch(() => {
      const inner = inBatch(() => assoc<number>({}, "a", 1));
      const outer = assoc(inner, "b", 2);
      expect(outer).not.toBe(inner);
      expect(inner).toEqual({ a: 1 });
      expect(Object.isFrozen(inner)).toBe(true);
    });
  });

  it("a batch that throws still ends: later writes copy, its maps are frozen", () => {
    const made: Entries[] = [];
    expect(() =>
      inBatch(() => {
        made.push(assoc<number>({}, "a", 1));
        throw new Error("reducer failed");
      }),
    ).toThrow("reducer failed");
    const [map = {}] = made;
    expect(Object.isFrozen(map)).toBe(true);
    expect(assoc(map, "b", 2)).not.toBe(map);
  });
});

describe("keysWhere", () => {
  it("answers the matching keys outside a batch", () => {
    expect(keysWhere({ a: 1, b: 2, c: 4 }, EVEN)).toEqual(["b", "c"]);
  });

  it("keeps its index up to date through the batch's writes", () => {
    const seen = inBatch(() => {
      const map = assoc<number>({ a: 1 }, "b", 2);
      const before = keysWhere(map, EVEN);
      assoc(map, "a", 6);
      assoc(map, "b", 3);
      assoc(map, "c", 8);
      return { after: keysWhere(map, EVEN), before, given: keysWhere({ x: 2 }, EVEN) };
    });
    expect(seen.before).toEqual(["b"]);
    expect(seen.after.toSorted(byText)).toEqual(["a", "c"]);
    expect(seen.given).toEqual(["x"]);
  });
});
