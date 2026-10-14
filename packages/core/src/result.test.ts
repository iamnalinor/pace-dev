import { describe, expect, it } from "vitest";

import { collectAll, err, ok } from "./result.ts";

const halves = (n: number) => (n % 2 === 0 ? ok([n / 2, n]) : err(`odd/${String(n)}`));

describe("Result", () => {
  it("wraps a value", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("wraps an error", () => {
    expect(err("task/not-found")).toEqual({ error: "task/not-found", ok: false });
  });

  it("collects every item's values in order, or stops at the first failure", () => {
    expect(collectAll([2, 4], halves)).toEqual({ ok: true, value: [1, 2, 2, 4] });
    expect(collectAll([], halves)).toEqual({ ok: true, value: [] });
    const seen: number[] = [];
    const watched = (n: number) => {
      seen.push(n);
      return halves(n);
    };
    expect(collectAll([2, 3, 5], watched)).toEqual({ error: "odd/3", ok: false });
    expect(seen).toEqual([2, 3]);
  });
});
