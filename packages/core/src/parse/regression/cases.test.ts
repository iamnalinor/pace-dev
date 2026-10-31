import { describe, expect, it } from "vitest";

import { ACTION_KINDS } from "../../actions/kinds.ts";
import { actionsByRules } from "../../actions/rules.ts";
import { artboardState, ctx } from "../../queries/fixture.fake.ts";
import { REGRESSION_CASES } from "./cases.fake.ts";

describe("the LLM regression set", () => {
  it("names each case once and asks for known kinds only", () => {
    const names = REGRESSION_CASES.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
    for (const item of REGRESSION_CASES) {
      expect(item.text.trim()).not.toBe("");
      expect(item.expect.kinds.length).toBeGreaterThan(0);
      expect(item.expect.kinds.every((kind) => ACTION_KINDS.includes(kind))).toBe(true);
    }
  });

  it("covers every kind it is meant to: create, update, delete, close, start, log and auto", () => {
    const kinds = new Set(REGRESSION_CASES.flatMap((item) => item.expect.kinds));
    for (const kind of [
      "task.create",
      "task.update",
      "task.delete",
      "task.close",
      "activity.start",
      "activity.log",
    ] as const) {
      expect(kinds.has(kind)).toBe(true);
    }
    expect(REGRESSION_CASES.some((item) => item.domain === "auto")).toBe(true);
  });

  it("agrees with the rules where they can read the case alone (a typed span)", () => {
    const spans = REGRESSION_CASES.filter((item) => item.name.startsWith("log: a past span"));
    expect(spans).toHaveLength(1);
    for (const span of spans) {
      const [action] = actionsByRules(span.text, "activity", {
        ctx: ctx(span.now),
        state: artboardState(span.now),
      });
      expect(action).toMatchObject({ kind: "activity.log", ...span.expect.first });
    }
  });
});
