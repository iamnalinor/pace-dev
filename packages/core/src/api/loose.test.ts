import { describe, expect, it } from "vitest";
import { z } from "zod";

import { loosen } from "./loose.ts";

const Nested = z.strictObject({ n: z.number().int().max(5) });
const ItemA = z.strictObject({ kind: z.literal("a"), at: z.iso.datetime() });
const ItemB = z.strictObject({ kind: z.literal("b"), nested: Nested.nullable() });
const Item = z.discriminatedUnion("kind", [ItemA, ItemB]);
const Answer = z.strictObject({
  items: z.array(Item).max(2),
  note: z.strictObject({ text: z.string() }).optional(),
});

describe("loosen", () => {
  it("drops keys it does not know at every depth instead of refusing them", () => {
    const answer = {
      extra: 1,
      items: [
        { at: "2026-10-06T10:00:00.000Z", kind: "a", more: true },
        { kind: "b", nested: { n: 3, why: "x" } },
      ],
      note: { size: 2, text: "hi" },
    };
    expect(() => Answer.parse(answer)).toThrow();
    expect(loosen(Answer).parse(answer)).toEqual({
      items: [
        { at: "2026-10-06T10:00:00.000Z", kind: "a" },
        { kind: "b", nested: { n: 3 } },
      ],
      note: { text: "hi" },
    });
  });

  it("keeps every other check: values, lengths, the union's tags", () => {
    const loose = loosen(Answer);
    expect(() => loose.parse({ items: [{ kind: "b", nested: { n: 9 } }] })).toThrow();
    expect(() => loose.parse({ items: [{ at: "today", kind: "a" }] })).toThrow();
    expect(() => loose.parse({ items: [{ kind: "c" }] })).toThrow();
    const three = Array.from({ length: 3 }, () => ({ kind: "b", nested: null }));
    expect(() => loose.parse({ items: three })).toThrow();
  });

  it("leaves the schema it was given strict", () => {
    loosen(Answer);
    expect(() => Answer.parse({ extra: 1, items: [] })).toThrow();
  });
});
