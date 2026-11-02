import { describe, expect, it } from "vitest";

import { type Action, clipText, clipWords } from "@pace/core";
import { artboardState } from "@pace/core/testing";

import { approvalText, doneLines } from "./approval.ts";

const LATER = "2026-10-09T12:00:00.000Z";

/** A short quote and sentence, as the toast's own (`toastQuote`) but small enough to see. */
const toast = {
  quote: (text: string): string => clipText(text, 12),
  sentence: (text: string): string => clipWords(text, 30),
};

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
    expect(approvalText([start("A very long activity name indeed")], world, toast)).toBe(
      "Started “A very long…”",
    );
  });

  it("names the first two actions and counts the rest, in each language's plural", () => {
    const five = ["One", "Two", "Three", "Four", "Five"].map((label) => start(label));
    expect(approvalText(five, world, toast)).toBe(
      "Started “One”; Started “Two”; and 3 more actions",
    );
    expect(approvalText(five.slice(0, 3), world, toast)).toBe(
      "Started “One”; Started “Two”; and 1 more action",
    );
    expect(approvalText(five, { ...world, language: "ru" }, toast)).toBe(
      "Запущено «One»; Запущено «Two»; и ещё 3 действия",
    );
    expect(approvalText(five.slice(0, 2), world, toast)).toBe("Started “One”; Started “Two”");
  });

  it("shortens a step it cannot word (its whole summary) at a word, never inside one", () => {
    const unworded: Action = {
      kind: "task.update",
      patch: {},
      summary: "The assistant will update the quarterly report for the board",
      taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    };
    expect(approvalText([unworded], world, toast)).toBe("The assistant will update the…");
  });

  it("says Done when there is nothing to name", () => {
    expect(approvalText([], world, toast)).toBe("Done");
  });
});
