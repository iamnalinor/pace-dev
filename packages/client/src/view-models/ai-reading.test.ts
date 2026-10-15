import { describe, expect, it } from "vitest";

import type { ParseResponse, Proposal, TaskDraft } from "@pace/core";

import { ALGEBRA_ID, artboardState, BOOKS_ID, ctx, MOSCOW } from "@pace/core/testing";

import { aiReading } from "./ai-reading.ts";
import { composerModel } from "./composer.ts";

const state = artboardState();

const draft = (overrides: Partial<TaskDraft>): TaskDraft => ({
  description: null,
  dueAt: null,
  dueTz: null,
  estimateMinutes: null,
  importance: null,
  link: null,
  presetId: "personal",
  projectId: null,
  projectName: null,
  sourceText: null,
  subtasks: [],
  title: "x",
  ...overrides,
});

const parsed = (
  proposals: readonly Proposal[],
  questions?: Extract<ParseResponse, { status: "parsed" }>["questions"],
): Extract<ParseResponse, { status: "parsed" }> => ({
  confidence: 1,
  domain: "task",
  proposals: [...proposals],
  provider: "fake",
  ...(questions !== undefined && { questions }),
  status: "parsed",
});

const create = (task: Partial<TaskDraft>, doubtful?: Proposal["doubtful"]): Proposal => ({
  kind: "task.create",
  summary: "New task",
  task: draft(task),
  ...(doubtful !== undefined && { doubtful }),
});

describe("aiReading", () => {
  it("fills the chips from the proposed task, keeping the text verbatim", () => {
    const text = "надо бы до пятницы 18:00 закончить отчёт для Алгебры, часа на два";
    const reading = aiReading(
      parsed([
        create({
          description: "методом линейных множителей",
          dueAt: "2026-10-09T15:00:00.000Z",
          dueTz: MOSCOW,
          estimateMinutes: 120,
          importance: "prioritized",
          projectId: ALGEBRA_ID,
          title: "закончить отчёт",
        }),
      ]),
    );
    expect(reading.edits).toMatchObject({
      description: "методом линейных множителей",
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
    const question = { field: "dueDate" as const, options: ["завтра"], question: "Когда?" };
    const reading = aiReading(
      parsed([create({ projectName: "Дача", title: "ремонт балкона" }, ["project"])], [question]),
    );
    expect(reading.edits.projectName).toBe("Дача");
    expect(reading.doubtful).toEqual(["project"]);
    expect(reading.questions).toEqual([question]);
    expect(
      composerModel(state, { edits: reading.edits, text: "ремонт балкона" }, ctx()).newProjectName,
    ).toBe("Дача");
  });

  it("leaves the chips to the rules when nothing new is proposed, and passes the proposals on", () => {
    const deletion: Proposal = { kind: "task.delete", summary: "Delete", taskId: BOOKS_ID };
    const reading = aiReading(parsed([deletion]));
    expect(reading).toMatchObject({
      doubtful: [],
      edits: {},
      proposals: [deletion],
      questions: [],
    });
  });
});
