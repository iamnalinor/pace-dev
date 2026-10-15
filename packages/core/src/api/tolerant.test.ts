import { describe, expect, it } from "vitest";
import { z } from "zod";

import { knownOrNull, knownValue, knownValues } from "./tolerant.ts";

const Item = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("a"), n: z.number() }),
  z.strictObject({ kind: z.literal("b") }),
]);

describe("knownValues", () => {
  it("keeps the entries this client knows, loosened, and drops ones a newer server added", () => {
    const list = knownValues(Item);
    expect(list.parse([{ kind: "a", more: 1, n: 2 }, { kind: "c" }, { kind: "b" }, "x"])).toEqual([
      { kind: "a", n: 2 },
      { kind: "b" },
    ]);
  });

  it("still refuses what is not a list", () => {
    expect(() => knownValues(Item).parse({ kind: "a" })).toThrow();
  });

  it("works for a list of enum values", () => {
    expect(knownValues(z.enum(["fcm", "poll"])).parse(["webpush", "poll"])).toEqual(["poll"]);
  });
});

describe("knownOrNull", () => {
  it("is the value loosened when known, `null` when not", () => {
    expect(knownOrNull(Item).parse({ kind: "b", why: 1 })).toEqual({ kind: "b" });
    expect(knownOrNull(Item).parse({ kind: "z" })).toBeNull();
    expect(knownOrNull(Item).parse(null)).toBeNull();
  });

  it("is `null` for a key an older server does not send at all", () => {
    // A field added to an answer is read as one an older server leaves out.
    const answer = z.object({ added: knownOrNull(z.string()) });
    expect(answer.parse({})).toEqual({ added: null });
  });
});

describe("knownValue", () => {
  it("is one of the values, or the stand-in for one a newer server added", () => {
    const resolution = knownValue(["read", "expired"], "read");
    expect(resolution.parse("expired")).toBe("expired");
    expect(resolution.parse("snoozed")).toBe("read");
    expect(() => resolution.parse(3)).toThrow();
  });
});
