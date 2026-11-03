import { zodSchema } from "ai";
import { describe, expect, it } from "vitest";

import { ModelOutputSchema } from "@pace/core";

import { fillAbsent } from "./schema-fit.ts";

const strict = async () => await zodSchema(ModelOutputSchema).jsonSchema;

describe("fillAbsent at the root (round 7 review 4)", () => {
  it("reads a left-out root `questions` as nothing to ask, so the answer passes", async () => {
    const answer = { actions: [], confidence: 1, domain: "task" };
    const filled = fillAbsent(answer, await strict());
    expect(filled).toEqual({ ...answer, questions: [] });
    expect(ModelOutputSchema.safeParse(filled).success).toBe(true);
  });

  it("never fills the root `actions`: an answer without it is no reading (class 95)", async () => {
    const filled = fillAbsent({ confidence: 1, domain: "task", questions: [] }, await strict());
    expect(filled).not.toHaveProperty("actions");
  });
});
