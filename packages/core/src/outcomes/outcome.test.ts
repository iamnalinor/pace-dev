import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";
import type { Preset, ResolvedPreset } from "../model/preset.ts";

import { autoOutcomeId } from "../ids.ts";
import { materialize } from "../materialize/materializer.ts";
import {
  algebraHw6Events,
  at,
  HW_CREATED,
  HW_DUE,
  HW_ID,
  hwCreated,
  solved,
  submitted,
  subtask,
  taskFixture,
} from "../materialize/task-fixture.fake.ts";
import { taskReducer } from "../materialize/task-reducer.ts";
import { type Closure, INITIAL_TASKS_STATE, type Task, type TasksState } from "../model/task.ts";
import { BASE_PRESETS } from "../presets/base-presets.ts";
import { INITIAL_PRESETS_STATE, type PresetsState } from "../presets/preset-reducer.ts";
import { addMinutesIso } from "../time.ts";
import { autoOutcomeEvents, deadlineOf, subtaskOutcome, taskOutcome } from "./outcome.ts";

const HW = BASE_PRESETS.hw.definition;
const WORK = BASE_PRESETS.work.definition;
const FINAL = "2026-10-14T20:59:00.000Z";
const RESUBMISSION: ResolvedPreset = {
  ...HW,
  deadlinePolicy: { kind: "resubmission", softDays: 7, finalAt: FINAL, finalTz: "UTC" },
};

const BEFORE = "2026-10-07T18:00:00.000Z";
const AFTER = "2026-10-08T09:00:00.000Z";

const closure = (outcome: Closure["outcome"], when: string): Closure => ({
  outcome,
  at: when,
  reason: null,
  source: "app",
  eventId: "e",
  confirmed: false,
});

const closedTask = (outcome: Closure["outcome"], when: string, patch: Partial<Task> = {}): Task =>
  taskFixture({ closed: closure(outcome, when), ...patch });

const sent = (id: string, when: null | string) => ({
  ...subtask(id, id),
  solvedAt: when ?? BEFORE,
  submittedAt: when,
});

const fold = (events: readonly Event[]): TasksState =>
  materialize(events, taskReducer, INITIAL_TASKS_STATE);

const userPreset = (id: string, definition: Preset["definition"]): Preset => ({
  id,
  name: id,
  extends: "hw",
  builtIn: false,
  archived: false,
  definition,
  createdAt: HW_CREATED,
  order: 100,
});

const presets: PresetsState = {
  byId: {
    ...INITIAL_PRESETS_STATE.byId,
    "hw.algebra": userPreset("hw.algebra", {
      deadlinePolicy: { kind: "resubmission", softDays: 7, finalAt: FINAL, finalTz: "UTC" },
    }),
    "hw.history": userPreset("hw.history", {}),
  },
};

describe("deadlineOf", () => {
  it("uses the due date as the final deadline under a hard policy", () => {
    expect(deadlineOf(taskFixture(), HW)).toEqual({ dueAt: HW_DUE, finalAt: HW_DUE });
    expect(deadlineOf(taskFixture({ dueAt: null, dueTz: null }), WORK)).toEqual({
      dueAt: null,
      finalAt: null,
    });
  });

  it("takes the final deadline from a resubmission policy", () => {
    expect(deadlineOf(taskFixture(), RESUBMISSION)).toEqual({ dueAt: HW_DUE, finalAt: FINAL });
    const open: ResolvedPreset = {
      ...HW,
      deadlinePolicy: { kind: "resubmission", softDays: 7, finalAt: null, finalTz: null },
    };
    expect(deadlineOf(taskFixture(), open)).toEqual({ dueAt: HW_DUE, finalAt: null });
  });
});

describe("subtaskOutcome", () => {
  it("is pending until submitted, then on time or late by the submission instant", () => {
    expect(subtaskOutcome(sent("s1", null), HW_DUE)).toBe("pending");
    expect(subtaskOutcome(sent("s1", BEFORE), HW_DUE)).toBe("done");
    expect(subtaskOutcome(sent("s1", HW_DUE), HW_DUE)).toBe("done");
    expect(subtaskOutcome(sent("s1", AFTER), HW_DUE)).toBe("done_late");
    expect(subtaskOutcome(sent("s1", AFTER), null)).toBe("done");
  });
});

describe("taskOutcome: the spec table", () => {
  it("is null while the task is open", () => {
    expect(taskOutcome(taskFixture(), HW)).toBeNull();
  });

  it("passes cancelled, cancelled_missed and skipped through", () => {
    expect(taskOutcome(closedTask("cancelled", BEFORE), WORK)).toBe("cancelled");
    expect(taskOutcome(closedTask("cancelled_missed", AFTER), HW)).toBe("cancelled_missed");
    expect(taskOutcome(closedTask("skipped", AFTER), HW)).toBe("skipped");
  });

  it("splits done by the closing instant for whole submission", () => {
    expect(taskOutcome(closedTask("done", BEFORE), WORK)).toBe("done");
    expect(taskOutcome(closedTask("done", HW_DUE), WORK)).toBe("done");
    expect(taskOutcome(closedTask("done", AFTER), WORK)).toBe("done_late");
    expect(taskOutcome(closedTask("done", AFTER, { dueAt: null, dueTz: null }), WORK)).toBe("done");
  });

  it("derives per-subtask outcomes from the submissions", () => {
    const onTime = closedTask("done", AFTER, {
      subtasks: [sent("s1", BEFORE), sent("s2", BEFORE)],
    });
    expect(taskOutcome(onTime, HW)).toBe("done");
    const someLate = closedTask("done", AFTER, {
      subtasks: [sent("s1", BEFORE), sent("s2", AFTER)],
    });
    expect(taskOutcome(someLate, HW)).toBe("done_late");
  });

  it("ignores unsubmitted subtasks when the task was closed as done", () => {
    const left = closedTask("done", AFTER, { subtasks: [sent("s1", BEFORE), sent("s2", null)] });
    expect(taskOutcome(left, HW)).toBe("done");
    const leftLate = closedTask("done", AFTER, { subtasks: [sent("s1", AFTER), sent("s2", null)] });
    expect(taskOutcome(leftLate, HW)).toBe("done_late");
  });

  it("falls back to the closing instant for a per-subtask task without subtasks", () => {
    expect(taskOutcome(closedTask("done", AFTER), HW)).toBe("done_late");
    expect(taskOutcome(closedTask("done", BEFORE), HW)).toBe("done");
  });

  it("keeps late as late under a resubmission policy", () => {
    expect(taskOutcome(closedTask("done", AFTER), { ...RESUBMISSION, submission: "whole" })).toBe(
      "done_late",
    );
  });
});

describe("taskOutcome: retro done before the deadline beats the automatic miss", () => {
  const missed = at(7, HW_DUE, {
    type: "task.closed",
    payload: { taskId: HW_ID, outcome: "cancelled_missed" },
    id: autoOutcomeId(HW_ID, "missed"),
    source: "system",
  });
  const doneRetro = at(8, BEFORE, {
    type: "task.closed",
    payload: { taskId: HW_ID, outcome: "done" },
  });

  it("wins once the action layer revokes the automatic event", () => {
    const revoke = at(9, AFTER, { type: "event.revoked", payload: { targetId: missed.id } });
    const task = fold([...algebraHw6Events(), missed, revoke, doneRetro]).byId[HW_ID];
    expect(task === undefined ? null : taskOutcome(task, HW)).toBe("done");
  });

  it("wins by time even before the revocation, because the first closure stays", () => {
    const task = fold([...algebraHw6Events(), missed, doneRetro]).byId[HW_ID];
    expect(task?.closed?.eventId).toBe(doneRetro.id);
    expect(task === undefined ? null : taskOutcome(task, HW)).toBe("done");
  });
});

describe("autoOutcomeEvents", () => {
  const none = new Set<string>();
  const run = (events: readonly Event[], now: string, existing = none) =>
    autoOutcomeEvents({ tasks: fold(events), presets, now, existingEventIds: existing });

  it("closes a task as missed once its final deadline has passed", () => {
    const hw6 = algebraHw6Events();
    expect(run(hw6, "2026-10-10T00:00:00.000Z")).toEqual([]);
    expect(run(hw6, addMinutesIso(FINAL, 1))).toEqual([
      {
        id: autoOutcomeId(HW_ID, "missed"),
        type: "task.closed",
        occurredAt: FINAL,
        precision: "exact",
        source: "system",
        payload: { taskId: HW_ID, outcome: "cancelled_missed" },
      },
    ]);
  });

  it("uses the due date under a hard policy and nothing without a final deadline", () => {
    const history = at(1, HW_CREATED, {
      type: "task.created",
      payload: {
        taskId: "hw:hw.history:2026-W41",
        title: "History HW",
        presetId: "hw.history",
        dueAt: HW_DUE,
        dueTz: "UTC",
        subtasks: [{ id: "a", label: "Essay" }],
        fields: {},
      },
    });
    expect(run([history], AFTER)[0]).toMatchObject({
      id: autoOutcomeId("hw:hw.history:2026-W41", "missed"),
      occurredAt: HW_DUE,
    });
    expect(run([history], HW_DUE)).toEqual([]);
    const noDue = at(2, HW_CREATED, {
      type: "task.created",
      payload: { taskId: "t", title: "x", presetId: "work", subtasks: [], fields: {} },
    });
    expect(run([noDue], "2027-01-01T00:00:00.000Z")).toEqual([]);
  });

  it("skips closed tasks, unknown presets and ids already in the log", () => {
    const done = [
      ...algebraHw6Events(),
      submitted(7, BEFORE, { subtaskIds: ["s3"], closes: true }),
    ];
    expect(run(done, addMinutesIso(FINAL, 1))).toEqual([]);
    const orphan = at(1, HW_CREATED, {
      type: "task.created",
      payload: {
        taskId: "t",
        title: "x",
        presetId: "nope",
        dueAt: HW_DUE,
        dueTz: "UTC",
        subtasks: [],
        fields: {},
      },
    });
    expect(run([orphan], AFTER)).toEqual([]);
    const seen = new Set([autoOutcomeId(HW_ID, "missed")]);
    expect(run(algebraHw6Events(), addMinutesIso(FINAL, 1), seen)).toEqual([]);
  });

  it("closes an empty recurring instance as skipped a day after its due date, never as missed", () => {
    const empty = [hwCreated(1)].map((event) =>
      event.type === "task.created"
        ? { ...event, payload: { ...event.payload, presetId: "hw.history", subtasks: [] } }
        : event,
    );
    expect(run(empty, addMinutesIso(HW_DUE, 23 * 60))).toEqual([]);
    expect(run(empty, addMinutesIso(HW_DUE, 24 * 60 + 1))).toEqual([
      {
        id: autoOutcomeId(HW_ID, "skipped"),
        type: "task.closed",
        occurredAt: addMinutesIso(HW_DUE, 24 * 60),
        precision: "exact",
        source: "system",
        payload: { taskId: HW_ID, outcome: "skipped", reason: "not-assigned" },
      },
    ]);
    const seen = new Set([autoOutcomeId(HW_ID, "skipped")]);
    expect(run(empty, addMinutesIso(HW_DUE, 24 * 60 + 1), seen)).toEqual([]);
  });

  it("treats an instance with any content as a real task", () => {
    const touched = [hwCreated(1), solved(2, BEFORE, "s1")];
    expect(run(touched, addMinutesIso(FINAL, 1))[0]?.payload).toMatchObject({
      outcome: "cancelled_missed",
    });
    const pasted = [hwCreated(1)].map((event) =>
      event.type === "task.created"
        ? { ...event, payload: { ...event.payload, subtasks: [], sourceText: "HW 6" } }
        : event,
    );
    expect(run(pasted, addMinutesIso(FINAL, 1))[0]?.payload).toMatchObject({
      outcome: "cancelled_missed",
    });
  });

  it("is deterministic and ordered by instant, then task id", () => {
    const second = at(3, HW_CREATED, {
      type: "task.created",
      payload: {
        taskId: "hw:hw.history:2026-W41",
        title: "History HW",
        presetId: "hw.history",
        dueAt: "2026-10-06T20:59:00.000Z",
        dueTz: "UTC",
        subtasks: [{ id: "a", label: "Essay" }],
        fields: {},
      },
    });
    const events = [...algebraHw6Events(), second];
    const now = addMinutesIso(FINAL, 1);
    const first = run(events, now);
    expect(first.map((event) => event.id)).toEqual([
      autoOutcomeId("hw:hw.history:2026-W41", "missed"),
      autoOutcomeId(HW_ID, "missed"),
    ]);
    expect(run(events.toReversed(), now)).toEqual(first);
  });
});
