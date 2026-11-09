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
  HW_PROBLEMS,
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
import {
  autoOutcomeEvents,
  deadlineOf,
  doneLateness,
  finalDeadlineOf,
  retiredAutoMissRevokes,
  subtaskOutcome,
  taskOutcome,
} from "./outcome.ts";

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

/** A subtask done at `when`, or still open (`null`). */
const sent = (id: string, when: null | string) => ({ ...subtask(id, id), doneAt: when });

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

  it("computes a final deadline N calendar days later while a fixed date stays fixed", () => {
    const offset: ResolvedPreset = {
      ...HW,
      deadlinePolicy: {
        kind: "resubmission",
        softDays: 3,
        finalAt: null,
        finalTz: null,
        finalMode: "offset",
      },
    };
    const task = taskFixture({ dueAt: "2026-03-28T17:00:00.000Z", dueTz: "Europe/Berlin" });
    expect(deadlineOf(task, offset).finalAt).toBe("2026-03-31T16:00:00.000Z");
    expect(deadlineOf(task, RESUBMISSION).finalAt).toBe(FINAL);
  });
});

describe("finalDeadlineOf", () => {
  it("is null under a hard policy and while a second stage has no final date", () => {
    expect(finalDeadlineOf(taskFixture(), HW)).toBeNull();
    const open: ResolvedPreset = {
      ...HW,
      deadlinePolicy: { kind: "resubmission", softDays: 7, finalAt: null, finalTz: null },
    };
    expect(finalDeadlineOf(taskFixture(), open)).toBeNull();
  });

  it("gives a fixed final date in the zone it was set in", () => {
    const fixed: ResolvedPreset = {
      ...HW,
      deadlinePolicy: {
        kind: "resubmission",
        softDays: 7,
        finalMode: "fixed",
        finalAt: FINAL,
        finalTz: "Europe/Moscow",
      },
    };
    expect(finalDeadlineOf(taskFixture({ dueTz: "UTC" }), fixed)).toEqual({
      at: FINAL,
      tz: "Europe/Moscow",
    });
  });

  it("gives the date N days after the due date in the due date's zone", () => {
    const offset: ResolvedPreset = {
      ...HW,
      deadlinePolicy: {
        kind: "resubmission",
        softDays: 7,
        finalAt: null,
        finalTz: null,
        finalMode: "offset",
      },
    };
    const task = taskFixture({ dueAt: "2026-10-31T20:59:00.000Z", dueTz: "Europe/Moscow" });
    expect(finalDeadlineOf(task, offset)).toEqual({
      at: "2026-11-07T20:59:00.000Z",
      tz: "Europe/Moscow",
    });
    expect(finalDeadlineOf(taskFixture({ dueAt: null, dueTz: null }), offset)).toBeNull();
  });
});

describe("subtaskOutcome", () => {
  it("is pending until done, then on time or late by the instant it was done", () => {
    expect(subtaskOutcome(sent("s1", null), HW_DUE)).toBe("pending");
    expect(subtaskOutcome(sent("s1", BEFORE), HW_DUE)).toBe("done");
    expect(subtaskOutcome(sent("s1", HW_DUE), HW_DUE)).toBe("done");
    expect(subtaskOutcome(sent("s1", AFTER), HW_DUE)).toBe("done_late");
    expect(subtaskOutcome(sent("s1", AFTER), null)).toBe("done");
  });
});

describe("taskOutcome: the spec table", () => {
  it("is null while the task is open", () => {
    expect(taskOutcome(taskFixture())).toBeNull();
  });

  it("passes cancelled, cancelled_missed and skipped through", () => {
    expect(taskOutcome(closedTask("cancelled", BEFORE))).toBe("cancelled");
    expect(taskOutcome(closedTask("cancelled_missed", AFTER))).toBe("cancelled_missed");
    expect(taskOutcome(closedTask("skipped", AFTER))).toBe("skipped");
  });

  it("splits done by the closing instant for a task without subtasks", () => {
    expect(taskOutcome(closedTask("done", BEFORE))).toBe("done");
    expect(taskOutcome(closedTask("done", HW_DUE))).toBe("done");
    expect(taskOutcome(closedTask("done", AFTER))).toBe("done_late");
    expect(taskOutcome(closedTask("done", AFTER, { dueAt: null, dueTz: null }))).toBe("done");
  });

  it("derives the outcome from the done marks, whatever the preset (no submission mode)", () => {
    const onTime = closedTask("done", AFTER, {
      subtasks: [sent("s1", BEFORE), sent("s2", BEFORE)],
    });
    expect(taskOutcome(onTime)).toBe("done");
    const someLate = closedTask("done", AFTER, {
      subtasks: [sent("s1", BEFORE), sent("s2", AFTER)],
    });
    expect(taskOutcome(someLate)).toBe("done_late");
  });

  it("goes by the closing instant while any subtask is left open (owner, 2026-11-09)", () => {
    const partLate = closedTask("done", AFTER, {
      subtasks: [sent("s1", BEFORE), sent("s2", null)],
    });
    expect(taskOutcome(partLate)).toBe("done_late");
    const partOnTime = closedTask("done", BEFORE, {
      subtasks: [sent("s1", BEFORE), sent("s2", null)],
    });
    expect(taskOutcome(partOnTime)).toBe("done");
  });

  it("goes by the latest done subtask once every subtask is done, whenever it was closed", () => {
    const allEarly = closedTask("done", AFTER, {
      subtasks: [sent("s1", BEFORE), sent("s2", BEFORE)],
    });
    expect(taskOutcome(allEarly)).toBe("done");
    expect(doneLateness([BEFORE, BEFORE], AFTER, HW_DUE)).toBe("done");
    expect(doneLateness([BEFORE, null], AFTER, HW_DUE)).toBe("done_late");
    expect(doneLateness([BEFORE, AFTER], BEFORE, HW_DUE)).toBe("done_late");
    expect(doneLateness([], AFTER, HW_DUE)).toBe("done_late");
  });

  it("reads an old log: problems sent early per subtask, the task closed late", () => {
    const allSent = [
      hwCreated(1),
      ...HW_PROBLEMS.map((problem, index) =>
        submitted(index + 2, BEFORE, { subtaskIds: [problem.id] }),
      ),
      at(20, AFTER, { type: "task.closed", payload: { taskId: HW_ID, outcome: "done" } }),
    ];
    const done = fold(allSent).byId[HW_ID];
    expect(done === undefined ? null : taskOutcome(done)).toBe("done");
    const oneSent = [
      hwCreated(1),
      submitted(2, BEFORE, { subtaskIds: ["s1"] }),
      at(20, AFTER, { type: "task.closed", payload: { taskId: HW_ID, outcome: "done" } }),
    ];
    const late = fold(oneSent).byId[HW_ID];
    expect(late === undefined ? null : taskOutcome(late)).toBe("done_late");
  });

  it("falls back to the closing instant for a task without done subtasks", () => {
    expect(taskOutcome(closedTask("done", AFTER))).toBe("done_late");
    expect(taskOutcome(closedTask("done", BEFORE))).toBe("done");
    const noneDone = { subtasks: [sent("s1", null), sent("s2", null)] };
    expect(taskOutcome(closedTask("done", AFTER, noneDone))).toBe("done_late");
    expect(taskOutcome(closedTask("done", BEFORE, noneDone))).toBe("done");
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
    expect(task === undefined ? null : taskOutcome(task)).toBe("done");
  });

  it("wins by time even before the revocation, because the first closure stays", () => {
    const task = fold([...algebraHw6Events(), missed, doneRetro]).byId[HW_ID];
    expect(task?.closed?.eventId).toBe(doneRetro.id);
    expect(task === undefined ? null : taskOutcome(task)).toBe("done");
  });
});

/** A recurring instance nobody filled in. */
const emptyInstance = (taskId: string, presetId: string, dueAt: string) =>
  at(1, HW_CREATED, {
    type: "task.created",
    payload: { taskId, title: "x", presetId, dueAt, dueTz: "UTC", subtasks: [], fields: {} },
  });

describe("autoOutcomeEvents", () => {
  const none = new Set<string>();
  const run = (events: readonly Event[], now: string, existing = none) =>
    autoOutcomeEvents({ tasks: fold(events), presets, now, existingEventIds: existing });

  it("never closes a task when its final deadline passes: it stays open, overdue (feedback 5)", () => {
    const hw6 = algebraHw6Events();
    expect(run(hw6, "2026-10-10T00:00:00.000Z")).toEqual([]);
    expect(run(hw6, addMinutesIso(FINAL, 1))).toEqual([]);
    expect(run(hw6, "2027-06-01T00:00:00.000Z")).toEqual([]);
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
    expect(run([history], AFTER)).toEqual([]);
  });

  it("skips closed tasks, unknown presets and ids already in the log", () => {
    const late = addMinutesIso(HW_DUE, 24 * 60 + 1);
    const closed = at(2, BEFORE, {
      type: "task.closed",
      payload: { taskId: HW_ID, outcome: "done" },
    });
    expect(run([emptyInstance(HW_ID, "hw.history", HW_DUE), closed], late)).toEqual([]);
    expect(run([emptyInstance("hw:nope:2026-W41", "nope", HW_DUE)], late)).toEqual([]);
    const seen = new Set([autoOutcomeId(HW_ID, "skipped")]);
    expect(run([emptyInstance(HW_ID, "hw.history", HW_DUE)], late, seen)).toEqual([]);
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

  it("treats an instance with any content as a real task: never closed automatically", () => {
    const touched = [hwCreated(1), solved(2, BEFORE, "s1")];
    expect(run(touched, addMinutesIso(FINAL, 1))).toEqual([]);
    const pasted = [hwCreated(1)].map((event) =>
      event.type === "task.created"
        ? { ...event, payload: { ...event.payload, subtasks: [], sourceText: "HW 6" } }
        : event,
    );
    expect(run(pasted, addMinutesIso(FINAL, 1))).toEqual([]);
  });

  it("is deterministic and ordered by instant, then task id", () => {
    const events = [
      emptyInstance("hw:hw.history:2026-W42", "hw.history", HW_DUE),
      emptyInstance("hw:hw.history:2026-W41", "hw.history", "2026-10-06T20:59:00.000Z"),
      emptyInstance("hw:hw.history:2026-W40", "hw.history", HW_DUE),
    ];
    const now = addMinutesIso(FINAL, 1);
    const first = run(events, now);
    expect(first.map((event) => event.id)).toEqual([
      autoOutcomeId("hw:hw.history:2026-W41", "skipped"),
      autoOutcomeId("hw:hw.history:2026-W40", "skipped"),
      autoOutcomeId("hw:hw.history:2026-W42", "skipped"),
    ]);
    expect(run(events.toReversed(), now)).toEqual(first);
  });
});

describe("retiredAutoMissRevokes", () => {
  it("revokes only an automatic miss, with a deterministic id", () => {
    const miss = at(7, HW_DUE, {
      type: "task.closed",
      payload: { taskId: HW_ID, outcome: "cancelled_missed" },
      id: autoOutcomeId(HW_ID, "missed"),
      source: "system",
    });
    const byHand = at(8, AFTER, {
      type: "task.closed",
      payload: { taskId: HW_ID, outcome: "cancelled_missed" },
    });
    const skip = at(9, AFTER, {
      type: "task.closed",
      payload: { taskId: HW_ID, outcome: "skipped" },
      id: autoOutcomeId(HW_ID, "skipped"),
      source: "system",
    });
    expect(retiredAutoMissRevokes([hwCreated(1), miss, byHand, skip], AFTER)).toEqual([
      {
        id: `${miss.id}:retired`,
        type: "event.revoked",
        occurredAt: AFTER,
        precision: "exact",
        source: "system",
        payload: { targetId: miss.id },
      },
    ]);
  });
});
