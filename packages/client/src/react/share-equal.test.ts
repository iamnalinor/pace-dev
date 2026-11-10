import { describe, expect, it } from "vitest";

import { shareEqual } from "./share-equal.ts";

describe("shareEqual keeps what did not change (bug-lessons 310)", () => {
  it("answers the previous value itself when nothing differs", () => {
    const previous = { rows: [{ id: "a", meta: [{ kind: "due" }] }], total: 1 };
    const next = { rows: [{ id: "a", meta: [{ kind: "due" }] }], total: 1 };
    expect(shareEqual(previous, next)).toBe(previous);
  });

  it("keeps the rows a change did not touch and takes the changed one", () => {
    const previous = { rows: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c" }] };
    const next = { rows: [{ id: "a", title: "A" }, { id: "b", title: "B2" }, { id: "c" }] };
    const shared = shareEqual(previous, next);
    expect(shared).toEqual(next);
    expect(shared).not.toBe(previous);
    expect(shared.rows[0]).toBe(previous.rows[0]);
    expect(shared.rows[1]).toEqual({ id: "b", title: "B2" });
    expect(shared.rows[2]).toBe(previous.rows[2]);
  });

  it("answers what was computed when a row left, a key went or a key came", () => {
    expect(shareEqual([{ id: "a" }, { id: "b" }], [{ id: "a" }])).toEqual([{ id: "a" }]);
    expect(shareEqual({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
    const grown = shareEqual({ a: 1 }, { a: 1, b: undefined });
    expect(Object.keys(grown)).toEqual(["a", "b"]);
  });

  it("keeps the rows after one that left, matched by their ids", () => {
    const previous = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const shared = shareEqual(previous, [{ id: "a" }, { id: "c" }]);
    expect(shared).toEqual([{ id: "a" }, { id: "c" }]);
    expect(shared[0]).toBe(previous[0]);
    expect(shared[1]).toBe(previous[2]);
  });

  it("never mixes an array with a record, and takes other objects as they are", () => {
    const set = new Set(["a"]);
    const date = new Date(0);
    expect(shareEqual({ 0: "a" }, ["a"])).toEqual(["a"]);
    expect(shareEqual({ ids: new Set(["a"]) }, { ids: set }).ids).toBe(set);
    expect(shareEqual({ at: new Date(0) }, { at: date }).at).toBe(date);
    expect(shareEqual(null, { a: 1 })).toEqual({ a: 1 });
    expect(shareEqual({ a: 1 }, null)).toBeNull();
  });
});
