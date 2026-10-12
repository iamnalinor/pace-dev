import { describe, expect, it } from "vitest";

import type { ParseResult } from "@pace/core";

import { ALGEBRA_ID, artboardState, ctx, MOSCOW } from "@pace/core/testing";

import { aiReading } from "./ai-reading.ts";
import { composerModel } from "./composer.ts";

const state = artboardState();

const result = (overrides: Partial<ParseResult>): ParseResult => ({
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
  ...overrides,
});

const read = (
  text: string,
  overrides: Partial<ParseResult>,
  doubtful: ParseResult["evidence"][number]["field"][] = [],
) =>
  aiReading(
    text,
    {
      doubtful,
      isClean: doubtful.length === 0,
      provider: "fake",
      result: result(overrides),
      status: "parsed",
    },
    { ctx: ctx(), state },
  );

describe("aiReading", () => {
  it("keeps the assistant's description for the task form", () => {
    const reading = read("дз по алгебре 290, 292 — методом линейных множителей", {
      description: "методом линейных множителей",
      subtasks: [
        { label: "290", number: 290 },
        { label: "292", number: 292 },
      ],
    });
    expect(reading.edits.description).toBe("методом линейных множителей");
  });

  it("fills the chips from the assistant's reading, keeping the text verbatim", () => {
    const text = "надо бы до пятницы 18:00 закончить отчёт для Алгебры, часа на два";
    const reading = read(text, {
      dueDate: "2026-10-09",
      dueTime: "18:00",
      estimateMinutes: 120,
      importance: "prioritized",
      project: "Algebra",
      title: "закончить отчёт",
    });
    expect(reading.edits).toMatchObject({
      due: { at: "2026-10-09T15:00:00.000Z", tz: MOSCOW },
      estimateMinutes: 120,
      importance: "prioritized",
      projectId: ALGEBRA_ID,
      title: "закончить отчёт",
    });
    const model = composerModel(state, { edits: reading.edits, text }, ctx());
    expect(model).toMatchObject({
      estimateMinutes: 120,
      importance: "prioritized",
      text,
      title: "закончить отчёт",
    });
  });

  it("names a project that does not exist yet and passes doubts and questions through", () => {
    const reading = read(
      "ремонт балкона",
      {
        project: "Дача",
        questions: [{ field: "dueDate", options: ["завтра"], question: "Когда?" }],
        title: "ремонт балкона",
      },
      ["project"],
    );
    expect(reading.edits.projectName).toBe("Дача");
    expect(reading.doubtful).toEqual(["project"]);
    expect(reading.questions).toEqual([
      { field: "dueDate", options: ["завтра"], question: "Когда?" },
    ]);
    expect(
      composerModel(state, { edits: reading.edits, text: "ремонт балкона" }, ctx()).newProjectName,
    ).toBe("Дача");
  });
});
