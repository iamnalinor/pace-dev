import { describe, expect, it } from "vitest";

import type { Action } from "./schema.ts";

import { at } from "../materialize/task-fixture.fake.ts";
import { artboardState, NOW } from "../queries/fixture.fake.ts";
import { addMinutesIso } from "../time.ts";
import { actionDetails, summaryDetails } from "./details.ts";

const state = artboardState(NOW);
const world = { language: "en" as const, state };

const create = (overrides: Partial<Extract<Action, { kind: "task.create" }>["task"]> = {}) =>
  ({
    kind: "task.create",
    summary: "The assistant will create “buy milk”",
    task: {
      description: null,
      dueAt: "2026-10-07T15:00:00.000Z",
      dueTz: "UTC",
      estimateMinutes: 30,
      importance: null,
      link: null,
      presetId: "personal",
      projectId: null,
      projectName: null,
      sourceText: "buy milk tomorrow 30m",
      subtasks: [],
      title: "buy milk",
      ...overrides,
    },
    doubtful: ["dueDate"],
  }) satisfies Action;

describe("actionDetails", () => {
  it("lists what a new task gets: category, due, estimate and importance, a doubtful one marked", () => {
    const lines = actionDetails(create(), world);
    expect(lines.map(({ label, value }) => [label, value])).toEqual([
      ["Task", "buy milk"],
      ["Category", "Personal"],
      ["Due", "Wed, Oct 7, 15:00"],
      ["Estimate", "30m"],
      ["Importance", "Normal"],
    ]);
    expect(lines.filter((line) => line.isDoubtful).map((line) => line.label)).toEqual(["Due"]);
  });

  it("names an activity's category and the time it is expected to take", () => {
    expect(
      actionDetails(
        {
          category: "sport",
          expectMinutes: 20,
          kind: "activity.start",
          label: "ЦСС",
          summary: "Start: ЦСС",
        },
        world,
      ).map(({ label, value }) => [label, value]),
    ).toEqual([
      ["Category", "Sport"],
      ["Expect", "~20m"],
    ]);
  });

  it("says which running activity a start stops, when the card knows the instant", () => {
    const running = artboardState(NOW, [
      at(901, addMinutesIso(NOW, -30), {
        payload: { activityId: "a-walk", category: "rest", label: "Walk" },
        type: "activity.started",
      }),
      at(902, addMinutesIso(NOW, -20), {
        payload: { activityId: "a-music", alongside: true, category: "rest", label: "Music" },
        type: "activity.started",
      }),
    ]);
    const start = {
      category: "other",
      kind: "activity.start",
      label: "Reading",
      summary: "Start: Reading",
    } satisfies Action;
    const lines = (now?: string) =>
      actionDetails(start, {
        language: "en",
        state: running,
        ...(now !== undefined && { now }),
      }).map(({ label, value }) => `${label}: ${value}`);
    // The main activity stops; one running alongside goes on.
    expect(lines(NOW)).toEqual(["Category: Other", "Stops: Walk"]);
    expect(lines()).toEqual(["Category: Other"]);
    expect(
      actionDetails(start, { language: "en", now: NOW, state }).map(({ label }) => label),
    ).toEqual(["Category"]);
  });

  it("says nothing more for an action its summary already describes", () => {
    expect(actionDetails({ kind: "task.delete", summary: "x", taskId: "t" }, world)).toEqual([]);
  });
});

describe("summaryDetails", () => {
  it("leaves out the title the summary names, unless the model only guessed it", () => {
    const fields = (action: Action) => summaryDetails(action, world).map((line) => line.field);
    expect(fields(create())).not.toContain("title");
    const guessed = { ...create({ title: "молоко" }), doubtful: ["title" as const] };
    expect(summaryDetails(guessed, world).find((line) => line.field === "title")).toMatchObject({
      isDoubtful: true,
      value: "молоко",
    });
  });
});
