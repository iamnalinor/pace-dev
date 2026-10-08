import { describe, expect, it } from "vitest";

import type { ParseResult } from "./schema.ts";

import { normalizeForEvidence } from "./normalize.ts";
import { verifyParse } from "./verify.ts";

const base: ParseResult = {
  category: null,
  description: null,
  dueDate: null,
  dueTime: null,
  estimateMinutes: null,
  evidence: [],
  importance: null,
  intent: "create_task",
  outcome: null,
  project: null,
  questions: [],
  subtasks: [],
  task: null,
  title: null,
};

const SOURCE = "Дз 7 по алгебре: задачи 1, 3, 5а до среды 23:59, часа на два";

describe("normalizeForEvidence", () => {
  it("folds case, ё, dashes, spaces and Latin lookalikes", () => {
    expect(normalizeForEvidence("  Ёлка —  TOP ")).toBe(normalizeForEvidence("елка - тор"));
    expect(normalizeForEvidence("Algebra")).not.toBe(normalizeForEvidence("алгебра"));
  });
});

const verify = (result: Partial<ParseResult>) =>
  verifyParse({ ...base, ...result }, { projectNames: ["Algebra"], source: SOURCE });

describe("verifyParse", () => {
  it("accepts strings copied from the message and numbers with a quote", () => {
    const verified = verify({
      dueDate: "2026-10-07",
      dueTime: "23:59",
      estimateMinutes: 120,
      evidence: [
        { field: "dueDate", quote: "до среды" },
        { field: "dueTime", quote: "23:59" },
        { field: "estimateMinutes", quote: "часа на два" },
      ],
      project: "Algebra",
      subtasks: [
        { label: "1", number: 1 },
        { label: "5а", number: null },
      ],
      title: "Дз 7 по алгебре",
    });
    expect(verified).toMatchObject({ doubtful: [], isClean: true });
  });

  it("flags invented strings and numbers without a quote", () => {
    const verified = verify({
      estimateMinutes: 90,
      evidence: [{ field: "dueTime", quote: "18:00" }],
      dueTime: "18:00",
      subtasks: [{ label: "9", number: 9 }],
      title: "Algebra homework 7",
    });
    expect(verified.doubtful).toEqual(["title", "subtasks", "dueTime", "estimateMinutes"]);
    expect(verified.isClean).toBe(false);
  });

  it("accepts a short composed title in the message's language", () => {
    const verified = verify({ title: "Домашка по алгебре: 290–534" });
    expect(verified.doubtful).not.toContain("title");
    const tooLong = verify({ title: "Домашка ".repeat(12) });
    expect(tooLong.doubtful).toContain("title");
  });

  it("is not clean while it asks a question", () => {
    const verified = verify({
      questions: [{ field: "subtasks", options: ["5", "5а"], question: "5 or 5а?" }],
    });
    expect(verified.isClean).toBe(false);
  });
});
