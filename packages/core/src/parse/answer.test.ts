import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ParseQuestion } from "./schema.ts";

import { ParseRequestSchema } from "../api/schemas/parse.ts";
import { answerAt, answerText, readAnswer } from "./answer.ts";

const QUESTIONS: readonly ParseQuestion[] = [
  {
    field: "dueDate",
    options: ["Today", "Tomorrow"],
    question: "By when does this need to be done?",
  },
  { field: "category", options: [], question: "Is this for work or home?" },
];

describe("answerText", () => {
  it("quotes the question and names the chosen option, the model's words untouched", () => {
    expect(answerText("By when does this need to be done?", "Tomorrow")).toBe(
      "«By when does this need to be done?» — Tomorrow",
    );
    expect(answerText("  В каком проекте? ", " Работа ")).toBe("«В каком проекте?» — Работа");
  });

  it("is always a correction the parse request accepts, at the longest question and option", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 300, minLength: 1 }).filter((text) => text.trim() !== ""),
        fc.string({ maxLength: 100, minLength: 1 }).filter((text) => text.trim() !== ""),
        (question, option) => {
          const text = answerText(question, option);
          expect(ParseRequestSchema.safeParse({ domain: "task", text, thread: [] }).success).toBe(
            true,
          );
          expect(text).toContain(option.trim());
          expect(text).toContain(question.trim());
        },
      ),
    );
  });
});

describe("answerAt", () => {
  it("reads the option a button points at by its indexes", () => {
    expect(answerAt(QUESTIONS, { option: 0, question: 0 })).toEqual({
      ok: true,
      value: "«By when does this need to be done?» — Today",
    });
  });

  it("refuses an index past the questions or their options (a stale or forged press)", () => {
    for (const at of [
      { option: 0, question: 1 },
      { option: 2, question: 0 },
      { option: 0, question: 5 },
      { option: -1, question: 0 },
      { option: 0.5, question: 0 },
    ]) {
      expect(answerAt(QUESTIONS, at)).toEqual({ error: "answer/unknown", ok: false });
    }
    expect(answerAt([], { option: 0, question: 0 })).toEqual({
      error: "answer/unknown",
      ok: false,
    });
  });

  it("reads a tapped answer back into its question and option; anything else is not one", () => {
    const text = answerText("By when does this need to be done?", "Tomorrow");
    expect(readAnswer(text)).toEqual({
      option: "Tomorrow",
      question: "By when does this need to be done?",
    });
    expect(readAnswer("на завтра")).toBeNull();
    expect(readAnswer("«Цитата» без ответа")).toBeNull();
    expect(readAnswer("«» — x")).toBeNull();
    expect(readAnswer("«Q» — ")).toBeNull();
  });
});
