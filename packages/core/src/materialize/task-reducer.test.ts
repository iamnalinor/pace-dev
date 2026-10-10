import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";

import { INITIAL_TASKS_STATE, progressOf, type Task, type TasksState } from "../model/task.ts";
import { materialize } from "./materializer.ts";
import {
  algebraHw6Events,
  at,
  HW_CREATED,
  HW_DUE,
  HW_ID,
  HW_TZ,
  hwCreated,
  solved,
  submitted,
  trk231Events,
  TRK_CREATED,
  TRK_ID,
} from "./task-fixture.fake.ts";
import { taskReducer } from "./task-reducer.ts";

const T = (hour: number, minute = 0): string =>
  `2026-10-06T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;

const fold = (events: readonly Event[]): TasksState =>
  materialize(events, taskReducer, INITIAL_TASKS_STATE);

const hw = (events: readonly Event[]): Task => {
  const task = fold(events).byId[HW_ID];
  if (task === undefined) {
    throw new Error("HW task missing");
  }
  return task;
};

const status = (index: number, occurredAt: string, value: "waiting" | Task["status"]): Event =>
  at(index, occurredAt, { type: "task.status.set", payload: { taskId: HW_ID, status: value } });

const closed = (
  index: number,
  occurredAt: string,
  close: {
    readonly outcome: "cancelled" | "cancelled_missed" | "done" | "skipped";
    readonly reason?: string;
  },
): Event => at(index, occurredAt, { type: "task.closed", payload: { taskId: HW_ID, ...close } });

const reopened = (index: number, occurredAt: string): Event =>
  at(index, occurredAt, { type: "task.reopened", payload: { taskId: HW_ID } });

const revoke = (index: number, occurredAt: string, targetId: string): Event =>
  at(index, occurredAt, { type: "event.revoked", payload: { targetId } });

describe("taskReducer: artboard scenarios", () => {
  it("materializes Algebra HW 6 with 7 problems, 4 solved and 2 sent", () => {
    const task = hw(algebraHw6Events());
    expect(task).toMatchObject({
      id: HW_ID,
      title: "Algebra HW 6",
      presetId: "hw.algebra",
      dueAt: HW_DUE,
      dueTz: HW_TZ,
      createdAt: HW_CREATED,
      status: "in_progress",
      statusSince: "2026-10-05T12:00:00.000Z",
      touched: true,
      closed: null,
      lastEventAt: "2026-10-06T08:00:00.000Z",
    });
    expect(task.subtasks).toHaveLength(7);
    expect(task.subtasks.filter((item) => item.solvedAt !== null)).toHaveLength(4);
    expect(task.subtasks.filter((item) => item.submittedAt !== null)).toHaveLength(2);
    expect(task.subtasks[0]).toEqual({
      id: "s1",
      label: "Matrix rank",
      number: 1,
      solvedAt: "2026-10-05T12:00:00.000Z",
      submittedAt: "2026-10-05T13:00:00.000Z",
    });
    expect(task.subtasks[6]).toMatchObject({ id: "s7", number: null, solvedAt: null });
    expect(progressOf(task, "subtasks")).toBeCloseTo(4 / 7, 10);
  });

  it("materializes TRK-231 with the slider at 4 and in progress", () => {
    const task = fold(trk231Events()).byId[TRK_ID];
    expect(task).toMatchObject({
      title: "Flaky latency test in nightly",
      presetId: "work",
      importance: "prioritized",
      importanceSetAt: TRK_CREATED,
      startAt: TRK_CREATED,
      startTz: "UTC",
      estimateMinutes: 480,
      slider: 4,
      status: "in_progress",
      statusSince: "2026-10-06T10:00:00.000Z",
      touched: true,
      fields: { link: "https://tracker.example.com/browse/TRK-231", submitVia: null },
      description: "p99 check fails ~1 in 5 runs on the shared runner.",
    });
    expect(task === undefined ? -1 : progressOf(task, "slider")).toBeCloseTo(0.4, 10);
  });

  it("starts a fresh task not started, untouched and without optional data", () => {
    const task = hw([hwCreated()]);
    expect(task).toMatchObject({
      projectId: null,
      importance: null,
      importanceSetAt: null,
      startAt: null,
      estimateMinutes: null,
      slider: null,
      description: null,
      sourceText: null,
      sources: [],
      overrides: null,
      status: "not_started",
      statusSince: HW_CREATED,
      touched: false,
      submittedAt: null,
      reopenedAt: null,
      lastEventAt: HW_CREATED,
    });
  });
});

describe("taskReducer: dedupe and unknown tasks", () => {
  it("ignores a second task.created for the same id", () => {
    const state = fold([hwCreated(1)]);
    const again = at(2, T(9), {
      type: "task.created",
      payload: { taskId: HW_ID, title: "Other", presetId: "hw", subtasks: [], fields: {} },
    });
    expect(taskReducer(state, again)).toBe(state);
  });

  it("ignores events for unknown tasks and non-task events", () => {
    const state = fold([hwCreated(1)]);
    const foreign = solved(2, T(9), { id: "s1", taskId: "nope" });
    expect(taskReducer(state, foreign)).toBe(state);
    const settings = at(3, T(9), { type: "settings.updated", payload: { language: "ru" } });
    expect(taskReducer(state, settings)).toBe(state);
  });
});

describe("taskReducer: preset switch", () => {
  it("keeps subtasks, slider and overrides across hw → work → hw", () => {
    const events = [
      ...algebraHw6Events(),
      at(7, T(9), { type: "task.progress.set", payload: { taskId: HW_ID, progress: 6 } }),
      at(8, T(9, 5), {
        type: "task.overrides.set",
        payload: { taskId: HW_ID, overrides: { defaultEstimateMinutes: 90 } },
      }),
      at(9, T(10), { type: "task.preset.set", payload: { taskId: HW_ID, presetId: "work" } }),
      at(10, T(11), { type: "task.preset.set", payload: { taskId: HW_ID, presetId: "hw" } }),
    ];
    const task = hw(events);
    expect(task.presetId).toBe("hw");
    expect(task.subtasks).toHaveLength(7);
    expect(task.slider).toBe(6);
    expect(task.overrides).toEqual({ defaultEstimateMinutes: 90 });
    const asWork = hw(events.slice(0, -1));
    expect(asWork.presetId).toBe("work");
    expect(asWork.subtasks).toEqual(task.subtasks);
  });

  it("is a no-op when the preset is already set", () => {
    const state = fold([hwCreated(1)]);
    const same = at(2, T(9), {
      type: "task.preset.set",
      payload: { taskId: HW_ID, presetId: "hw.algebra" },
    });
    expect(taskReducer(state, same)).toBe(state);
  });
});

describe("taskReducer: status", () => {
  it("reads a waiting status (removed in stage 6) as in progress", () => {
    const task = hw([hwCreated(1), status(2, T(10), "waiting")]);
    expect(task).toMatchObject({ status: "in_progress", statusSince: T(10), touched: true });
  });

  it("keeps paused across later work and moves through the explicit statuses", () => {
    const task = hw([
      hwCreated(1),
      status(2, T(10), "waiting"),
      status(3, T(11, 30), "in_progress"),
      status(4, T(12, 45), "paused"),
    ]);
    expect(task.status).toBe("paused");
    expect(task.statusSince).toBe(T(12, 45));
    expect(task.touched).toBe(true);
  });

  it("treats setting the current status again as a no-op", () => {
    const state = fold([hwCreated(1), status(2, T(10), "paused")]);
    const again = status(3, T(11), "paused");
    expect(taskReducer(state, again)).toBe(state);
  });

  it("lets an explicit status win over the implicit in-progress", () => {
    const paused = hw([hwCreated(1), status(2, T(9), "paused"), solved(3, T(10), "s1")]);
    expect(paused.status).toBe("paused");
    expect(paused.touched).toBe(true);
    const back = hw([hwCreated(1), solved(2, T(9), "s1"), status(3, T(10), "not_started")]);
    expect(back.status).toBe("not_started");
    expect(back.touched).toBe(true);
  });

  it("moves to in progress on focus.started and keeps the status on focus.ended", () => {
    const started = at(2, T(9), { type: "focus.started", payload: { taskId: HW_ID } });
    const ended = at(3, T(10), { type: "focus.ended", payload: { taskId: HW_ID } });
    const task = hw([hwCreated(1), started, ended]);
    expect(task).toMatchObject({ status: "in_progress", statusSince: T(9), touched: true });
    expect(task.lastEventAt).toBe(T(10));
  });

  it("keeps the status through a close and a reopen", () => {
    const task = hw([
      hwCreated(1),
      status(2, T(10), "paused"),
      closed(3, T(11), { outcome: "cancelled", reason: "not needed" }),
      reopened(4, T(13)),
    ]);
    expect(task).toMatchObject({
      status: "paused",
      statusSince: T(13),
      closed: null,
      reopenedAt: T(13),
    });
  });
});

describe("taskReducer: subtasks", () => {
  it("sets solvedAt once and keeps the first solve", () => {
    const task = hw([hwCreated(1), solved(2, T(9), "s3"), solved(3, T(10), "s3")]);
    expect(task.subtasks[2]?.solvedAt).toBe(T(9));
    const state = fold([hwCreated(1), solved(2, T(9), "s3")]);
    const again = solved(3, T(10), "s3");
    const unknown = solved(4, T(10), "nope");
    expect(taskReducer(state, again)).toBe(state);
    expect(taskReducer(state, unknown)).toBe(state);
  });

  it("un-solves through revocation and reverts the implicit status", () => {
    const events = [
      hwCreated(1),
      solved(2, T(9), "s1"),
      revoke(3, T(10), solved(2, T(9), "s1").id),
    ];
    const task = hw(events);
    expect(task.subtasks[0]?.solvedAt).toBeNull();
    expect(task.status).toBe("not_started");
    expect(task.touched).toBe(false);
  });

  it("appends added subtasks and ignores duplicate ids", () => {
    const added = at(2, T(9), {
      type: "task.subtasks.added",
      payload: {
        taskId: HW_ID,
        subtasks: [
          { id: "s8", label: "Extra" },
          { id: "s1", label: "Dup" },
        ],
      },
    });
    const task = hw([hwCreated(1), added]);
    expect(task.subtasks).toHaveLength(8);
    expect(task.subtasks[7]).toEqual({
      id: "s8",
      label: "Extra",
      number: null,
      solvedAt: null,
      submittedAt: null,
    });
    const state = fold([hwCreated(1)]);
    const onlyDup = at(3, T(9), {
      type: "task.subtasks.added",
      payload: { taskId: HW_ID, subtasks: [{ id: "s1", label: "Dup" }] },
    });
    expect(taskReducer(state, onlyDup)).toBe(state);
  });
});

describe("taskReducer: submission", () => {
  it("marks only solved subtasks as submitted, keeping the first submission time", () => {
    const task = hw([
      hwCreated(1),
      solved(2, T(9), "s1"),
      submitted(3, T(10), { subtaskIds: ["s1", "s2"] }),
      submitted(4, T(11), { subtaskIds: ["s1"] }),
    ]);
    expect(task.subtasks[0]?.submittedAt).toBe(T(10));
    expect(task.subtasks[1]?.submittedAt).toBeNull();
    expect(task.submittedAt).toBeNull();
    expect(task.closed).toBeNull();
    const state = fold([hwCreated(1)]);
    const unsolved = submitted(5, T(12), { subtaskIds: ["s2"] });
    expect(taskReducer(state, unsolved)).toBe(state);
  });

  it("closes the task as done in the same event when closes is set", () => {
    const last = submitted(3, T(10), { subtaskIds: ["s1"], closes: true });
    const task = hw([hwCreated(1), solved(2, T(9), "s1"), last]);
    expect(task.closed).toEqual({
      outcome: "done",
      at: T(10),
      reason: null,
      source: "app",
      eventId: last.id,
      confirmed: false,
    });
  });

  it("records a whole-task submission on the task", () => {
    const task = hw([hwCreated(1), submitted(2, T(10), {}), submitted(3, T(11), {})]);
    expect(task.submittedAt).toBe(T(10));
    expect(task.closed).toBeNull();
    const done = hw([hwCreated(1), submitted(2, T(10), { closes: true })]);
    expect(done.closed?.outcome).toBe("done");
  });
});

describe("taskReducer: close and reopen", () => {
  it("records the closure with reason, source and event id and keeps touched", () => {
    const close = at(3, T(11), {
      type: "task.closed",
      payload: { taskId: HW_ID, outcome: "cancelled", reason: "superseded" },
      source: "mcp",
    });
    const task = hw([hwCreated(1), solved(2, T(9), "s1"), close]);
    expect(task.closed).toEqual({
      outcome: "cancelled",
      at: T(11),
      reason: "superseded",
      source: "mcp",
      eventId: close.id,
      confirmed: false,
    });
    expect(task.touched).toBe(true);
    expect(task.status).toBe("in_progress");
  });

  it("keeps the first closure until the task is reopened", () => {
    const state = fold([hwCreated(1), closed(2, T(9), { outcome: "done" })]);
    const again = closed(3, T(10), { outcome: "skipped" });
    expect(taskReducer(state, again)).toBe(state);
    const task = hw([
      hwCreated(1),
      closed(2, T(9), { outcome: "done" }),
      reopened(3, T(10)),
      closed(4, T(11), { outcome: "skipped", reason: "not needed" }),
    ]);
    expect(task.closed).toMatchObject({ outcome: "skipped", reason: "not needed", at: T(11) });
    expect(task.reopenedAt).toBe(T(10));
  });

  it("ignores reopening an open task", () => {
    const state = fold([hwCreated(1)]);
    const reopen = reopened(2, T(9));
    expect(taskReducer(state, reopen)).toBe(state);
  });
});

const withTicket = (ticket: string): Task =>
  hw([
    hwCreated(1),
    at(2, T(9), { type: "task.updated", payload: { taskId: HW_ID, fields: { ticket } } }),
  ]);

describe("taskReducer: attributes", () => {
  it("reads a legacy ticket as the link only when it is a web address", () => {
    expect(withTicket("https://tracker.example.com/T-1").fields.link).toBe(
      "https://tracker.example.com/T-1",
    );
    expect(withTicket("TRK-231").fields.link).toBeNull();
  });

  it("patches title, description, dates and fields through task.updated", () => {
    const task = hw([
      hwCreated(1),
      at(2, T(9), {
        type: "task.updated",
        payload: {
          taskId: HW_ID,
          title: "Algebra HW 6 (revised)",
          description: "Chapter 3",
          startAt: T(8),
          startTz: "UTC",
          fields: { submitVia: "LMS" },
        },
      }),
      at(3, T(10), { type: "task.updated", payload: { taskId: HW_ID, description: null } }),
    ]);
    expect(task).toMatchObject({
      title: "Algebra HW 6 (revised)",
      description: null,
      startAt: T(8),
      startTz: "UTC",
      dueAt: HW_DUE,
      fields: { link: null, submitVia: "LMS" },
    });
  });

  it("sets importance with its time, project and estimate; an old rank changes nothing", () => {
    const task = hw([
      hwCreated(1),
      at(2, T(9), {
        type: "task.importance.set",
        payload: { taskId: HW_ID, importance: "asap" },
      }),
      at(3, T(9, 1), { type: "task.project.set", payload: { taskId: HW_ID, projectId: "p1" } }),
      at(4, T(9, 2), { type: "task.rank.set", payload: { taskId: HW_ID, rank: 2 } }),
      at(5, T(9, 3), {
        type: "task.estimate.set",
        payload: { taskId: HW_ID, estimateMinutes: 90 },
      }),
    ]);
    expect(task).toMatchObject({
      importance: "asap",
      importanceSetAt: T(9),
      projectId: "p1",
      estimateMinutes: 90,
    });
    const cleared = hw([
      hwCreated(1),
      at(2, T(9), { type: "task.project.set", payload: { taskId: HW_ID, projectId: "p1" } }),
      at(3, T(10), { type: "task.project.set", payload: { taskId: HW_ID, projectId: null } }),
      at(4, T(10), {
        type: "task.estimate.set",
        payload: { taskId: HW_ID, estimateMinutes: null },
      }),
    ]);
    expect(cleared).toMatchObject({ projectId: null, estimateMinutes: null });
  });

  it("refreshes importanceSetAt even for the same importance", () => {
    const task = hw([
      hwCreated(1),
      at(2, T(9), { type: "task.importance.set", payload: { taskId: HW_ID, importance: "asap" } }),
      at(3, T(10), { type: "task.importance.set", payload: { taskId: HW_ID, importance: "asap" } }),
    ]);
    expect(task.importanceSetAt).toBe(T(10));
  });

  it("appends sources and seeds sourceText from the first one", () => {
    const task = hw([
      hwCreated(1),
      at(2, T(9), {
        type: "task.source.attached",
        payload: { taskId: HW_ID, sourceText: "HW 6: problems 1–7", sourceUrl: "https://x.test/1" },
      }),
      at(3, T(10), {
        type: "task.source.attached",
        payload: { taskId: HW_ID, sourceText: "Also 7a is a bonus" },
      }),
    ]);
    expect(task.sourceText).toBe("HW 6: problems 1–7");
    expect(task.sources).toEqual([
      { text: "HW 6: problems 1–7", url: "https://x.test/1", at: T(9) },
      { text: "Also 7a is a bonus", url: null, at: T(10) },
    ]);
  });

  it("seeds sources from the creation's sourceText", () => {
    const created = at(1, T(8), {
      type: "task.created",
      payload: {
        taskId: HW_ID,
        title: "x",
        presetId: "hw",
        subtasks: [],
        fields: {},
        sourceText: "pasted",
      },
    });
    const task = hw([created]);
    expect(task.sourceText).toBe("pasted");
    expect(task.sources).toEqual([{ text: "pasted", url: null, at: T(8) }]);
  });

  it("replaces overrides and treats an empty record as none", () => {
    const task = hw([
      hwCreated(1),
      at(2, T(9), {
        type: "task.overrides.set",
        payload: { taskId: HW_ID, overrides: { defaultImportance: "asap" } },
      }),
      at(3, T(10), { type: "task.overrides.set", payload: { taskId: HW_ID, overrides: {} } }),
    ]);
    expect(task.overrides).toBeNull();
  });
});

describe("taskReducer: order insensitivity", () => {
  it("materializes the same task whatever the input order", () => {
    const events = [
      ...algebraHw6Events(),
      status(7, T(9), "waiting"),
      status(8, T(10), "in_progress"),
      submitted(9, T(11), { subtaskIds: ["s3", "s4"] }),
      closed(10, T(12), { outcome: "done" }),
      reopened(11, T(13)),
    ];
    const expected = fold(events);
    fc.assert(
      fc.property(fc.shuffledSubarray(events, { minLength: events.length }), (shuffled) => {
        expect(fold(shuffled)).toEqual(expected);
      }),
    );
  });
});

describe("taskReducer: confirmed automatic outcomes", () => {
  it("records a closure as unconfirmed unless the payload says otherwise", () => {
    const done = closed(2, T(9), { outcome: "done" });
    expect(hw([hwCreated(1), done]).closed?.confirmed).toBe(false);
    const confirmed = at(2, T(9), {
      type: "task.closed",
      payload: { taskId: HW_ID, outcome: "cancelled_missed", confirmed: true },
      source: "system",
    });
    expect(hw([hwCreated(1), confirmed]).closed?.confirmed).toBe(true);
  });

  it("is confirmed by amending the closing event", () => {
    const auto = at(2, T(9), {
      type: "task.closed",
      payload: { taskId: HW_ID, outcome: "cancelled_missed" },
      source: "system",
    });
    const amend = at(3, T(10), {
      type: "event.amended",
      payload: { targetId: auto.id, patch: { confirmed: true } },
    });
    expect(hw([hwCreated(1), auto]).closed?.confirmed).toBe(false);
    expect(hw([hwCreated(1), auto, amend]).closed?.confirmed).toBe(true);
    const undo = revoke(4, T(11), amend.id);
    expect(hw([hwCreated(1), auto, amend, undo]).closed?.confirmed).toBe(false);
  });
});
