import { describe, expect, it } from "vitest";

import type { Action } from "@pace/core";

import { artboardState, NOW } from "@pace/core/testing";

import { describeActions } from "./describe.ts";

const extras = { language: "en" as const, now: NOW, questions: [], state: artboardState(NOW) };

describe("the bot's description of actions", () => {
  it("lists an activity's category and expected length under its summary, as the web card does", () => {
    const start: Action = {
      category: "sport",
      doubtful: ["expectMinutes"],
      expectMinutes: 20,
      kind: "activity.start",
      label: "ЦСС",
      summary: "Start: ЦСС",
    };
    expect(describeActions([start], extras).split("\n")).toEqual([
      "Start: ЦСС",
      "Category: Sport",
      "Expect: ~20m (check this)",
    ]);
  });
});
