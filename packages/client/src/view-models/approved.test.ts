import { describe, expect, it } from "vitest";

import { type Action, clipText } from "@pace/core";
import { artboardState } from "@pace/core/testing";

import { approvalText, doneLines } from "./approval.ts";

const LATER = "2026-10-09T12:00:00.000Z";

/** A short quote, as the toast's own (`toastQuote`) but small enough to see. */
const quote = (text: string): string => clipText(text, 12);

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

describe("the approval toast's words (fix round 1 of QA 18)", () => {
  const world = { language: "en" as const, now: LATER, state: artboardState(LATER) };

  it("quotes a long name short inside its sentence: the sentence and its closing quote stay", () => {
    expect(approvalText([start("A very long activity name indeed")], world, quote)).toBe(
      "Started “A very long…”",
    );
  });

  it("names the first two actions and counts the rest, in each language's plural", () => {
    const five = ["One", "Two", "Three", "Four", "Five"].map((label) => start(label));
    expect(approvalText(five, world, quote)).toBe(
      "Started “One”; Started “Two”; and 3 more actions",
    );
    expect(approvalText(five.slice(0, 3), world, quote)).toBe(
      "Started “One”; Started “Two”; and 1 more action",
    );
    expect(approvalText(five, { ...world, language: "ru" }, quote)).toBe(
      "Запущено «One»; Запущено «Two»; и ещё 3 действия",
    );
    expect(approvalText(five.slice(0, 2), world, quote)).toBe("Started “One”; Started “Two”");
  });

  it("says Done when there is nothing to name", () => {
    expect(approvalText([], world, quote)).toBe("Done");
  });
});
