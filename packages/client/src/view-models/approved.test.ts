import { describe, expect, it } from "vitest";

import type { Action } from "@pace/core";

import { artboardState } from "@pace/core/testing";

import { doneLines } from "./decisions.ts";

const LATER = "2026-10-09T12:00:00.000Z";

const start = (label: string): Action => ({
  category: "study",
  kind: "activity.start",
  label,
  summary: `The assistant will start “${label}”`,
});

describe("what an approval did, in words (QA round 11 L3, round 14 L10)", () => {
  it("says each action in the past tense, as the assistant log does", () => {
    const world = { language: "en" as const, now: LATER, state: artboardState(LATER) };
    expect(doneLines([start("Reading")], world)).toEqual(["Started “Reading”"]);
    expect(doneLines([start("Бег")], { ...world, language: "ru" })).toEqual(["Запущено «Бег»"]);
  });
});
