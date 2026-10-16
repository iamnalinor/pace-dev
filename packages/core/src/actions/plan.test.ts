import { describe, expect, it } from "vitest";

import type { Event, EventInput } from "../events/event-schema.ts";
import type { CoreState } from "../materialize/core-state.ts";
import type { ActionBody, TaskDraft } from "./schema.ts";

import { at, HW_ID, hwCreated } from "../materialize/task-fixture.fake.ts";
import { artboardState, BOOKS_ID, NOW, REPLY_ID, WORK_ID } from "../queries/fixture.fake.ts";
import { addMinutesIso } from "../time.ts";
import { planAction, planActions } from "./plan.ts";

const ids = () => {
  const counter = { next: 0 };
  return (): string => {
    counter.next += 1;
    return `id-${String(counter.next)}`;
  };
};

const world = { deviceTz: "Europe/Moscow", now: NOW, source: "bot" } as const;

const plan = (action: ActionBody, state: CoreState = artboardState()) =>
  planAction(state, action, { ...world, newId: ids() });

/** The events a plan writes, without their envelopes. */
const bodies = (result: ReturnType<typeof plan>) =>
  result.ok ? result.value.map(({ payload, type }) => ({ payload, type })) : result;

const draft = (overrides: Partial<TaskDraft> = {}): TaskDraft => ({
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
  title: "Renew the passport",
  ...overrides,
});

const minutes = (count: number): string => addMinutesIso(NOW, count);

/** The artboard with activities: "Work" running since 10:00, "Lunch" logged 09:00–09:30. */
const RUNNING = "a-work";
const LOGGED = "a-lunch";
const BEFORE = "a-read";
const timeEvents: readonly Event[] = [
  at(900, minutes(-180), {
    payload: { activityId: BEFORE, category: "study", label: "Read" },
    type: "activity.started",
  }),
  at(901, minutes(-120), {
    payload: { activityId: RUNNING, category: "work", label: "Work" },
    type: "activity.started",
  }),
  at(902, minutes(-150), {
    payload: {
      activityId: LOGGED,
      category: "food",
      endAt: minutes(-150),
      label: "Lunch",
      startAt: minutes(-170),
    },
    type: "activity.logged",
  }),
];
const tracked = (): CoreState => artboardState(NOW, timeEvents);

describe("planAction: task.create", () => {
  it("writes the draft as a new task stamped now by the source", () => {
    const result = plan({
      kind: "task.create",
      task: draft({
        dueAt: "2026-10-09T20:59:00.000Z",
        dueTz: "Europe/Moscow",
        link: "https://example.com/form",
        projectId: WORK_ID,
        sourceText: "renew the passport by friday https://example.com/form",
        subtasks: [{ label: "photo", number: null }],
      }),
    });
    expect(result.ok && result.value.every((input) => input.occurredAt === NOW)).toBe(true);
    expect(result.ok && result.value.every((input) => input.source === "bot")).toBe(true);
    expect(bodies(result)).toEqual([
      {
        payload: {
          dueAt: "2026-10-09T20:59:00.000Z",
          dueTz: "Europe/Moscow",
          fields: { link: "https://example.com/form" },
          importance: "normal",
          presetId: "personal",
          projectId: WORK_ID,
          sourceText: "renew the passport by friday https://example.com/form",
          subtasks: [{ id: "id-2", label: "photo" }],
          taskId: "id-1",
          title: "Renew the passport",
        },
        type: "task.created",
      },
    ]);
  });

  it("keeps no source when the draft was not read from a message", () => {
    const result = bodies(plan({ kind: "task.create", task: draft({ projectId: WORK_ID }) }));
    expect(result).toEqual([
      {
        payload: {
          fields: {},
          importance: "normal",
          presetId: "personal",
          projectId: WORK_ID,
          subtasks: [],
          taskId: "id-1",
          title: "Renew the passport",
        },
        type: "task.created",
      },
    ]);
  });

  it("refuses a category that does not exist and a blank title", () => {
    expect(plan({ kind: "task.create", task: draft({ presetId: "nope" }) })).toEqual({
      error: "preset/unknown",
      ok: false,
    });
    expect(plan({ kind: "task.create", task: draft({ title: "  " }) })).toEqual({
      error: "action/invalid",
      ok: false,
    });
  });

  it("refuses a project that does not exist, whether named or addressed by id", () => {
    expect(plan({ kind: "task.create", task: draft({ projectName: "Japan" }) })).toEqual({
      error: "action/unknown-project",
      ok: false,
    });
    expect(plan({ kind: "task.create", task: draft({ projectId: "p-nope" }) })).toEqual({
      error: "action/unknown-project",
      ok: false,
    });
  });
});

describe("planAction: task.update", () => {
  it("writes each changed field with the event that changes it", () => {
    const result = bodies(
      plan({
        kind: "task.update",
        patch: {
          description: null,
          due: { at: "2026-10-09T20:59:00.000Z", tz: "Europe/Moscow" },
          estimateMinutes: 45,
          importance: "prioritized",
          link: "https://example.com/x",
          presetId: "work",
          projectId: WORK_ID,
          subtasks: { add: [{ label: "find the card", number: null }] },
          title: "Return the library books",
        },
        taskId: BOOKS_ID,
      }),
    );
    expect(result).toEqual([
      {
        payload: {
          description: null,
          dueAt: "2026-10-09T20:59:00.000Z",
          dueTz: "Europe/Moscow",
          fields: { link: "https://example.com/x" },
          taskId: BOOKS_ID,
          title: "Return the library books",
        },
        type: "task.updated",
      },
      { payload: { importance: "prioritized", taskId: BOOKS_ID }, type: "task.importance.set" },
      { payload: { projectId: WORK_ID, taskId: BOOKS_ID }, type: "task.project.set" },
      { payload: { presetId: "work", taskId: BOOKS_ID }, type: "task.preset.set" },
      { payload: { estimateMinutes: 45, taskId: BOOKS_ID }, type: "task.estimate.set" },
      {
        payload: { subtasks: [{ id: "id-1", label: "find the card" }], taskId: BOOKS_ID },
        type: "task.subtasks.added",
      },
    ]);
  });

  it("clears the due date, the project and the estimate with null", () => {
    expect(
      bodies(
        plan({
          kind: "task.update",
          patch: { due: null, estimateMinutes: null, projectId: null },
          taskId: HW_ID,
        }),
      ),
    ).toEqual([
      { payload: { dueAt: null, taskId: HW_ID }, type: "task.updated" },
      { payload: { projectId: null, taskId: HW_ID }, type: "task.project.set" },
      { payload: { estimateMinutes: null, taskId: HW_ID }, type: "task.estimate.set" },
    ]);
  });

  it("refuses moving a task into an unknown project", () => {
    expect(updateTask({ projectName: "Japan" })).toEqual({
      error: "action/unknown-project",
      ok: false,
    });
    expect(updateTask({ projectId: "p-nope" })).toEqual({
      error: "action/unknown-project",
      ok: false,
    });
  });

  it("removes and renames open subtasks; a renamed one keeps its number", () => {
    expect(
      bodies(
        plan({
          kind: "task.update",
          patch: { subtasks: { remove: ["s5"], rename: [{ label: "Blocks", subtaskId: "s6" }] } },
          taskId: HW_ID,
        }),
      ),
    ).toEqual([
      { payload: { subtaskId: "s5", taskId: HW_ID }, type: "task.subtask.removed" },
      { payload: { subtaskId: "s6", taskId: HW_ID }, type: "task.subtask.removed" },
      {
        payload: { subtasks: [{ id: "id-1", label: "Blocks", number: 6 }], taskId: HW_ID },
        type: "task.subtasks.added",
      },
    ]);
  });

  it("takes a subtask both removed and renamed off once, and does not bring it back", () => {
    expect(
      bodies(
        updateTask({ subtasks: { remove: ["s5"], rename: [{ label: "KC", subtaskId: "s5" }] } }),
      ),
    ).toEqual([{ payload: { subtaskId: "s5", taskId: HW_ID }, type: "task.subtask.removed" }]);
  });

  it("refuses an unknown task, an empty or invalid patch, and unknown or done subtasks", () => {
    expect(updateTask({ title: "x" }, "t-nope")).toEqual({
      error: "action/unknown-task",
      ok: false,
    });
    expect(updateTask({})).toEqual({ error: "action/empty-patch", ok: false });
    expect(updateTask({ subtasks: {} })).toEqual({ error: "action/empty-patch", ok: false });
    expect(updateTask({ title: " ".repeat(3) })).toEqual({ error: "action/invalid", ok: false });
    expect(updateTask({ presetId: "nope" })).toEqual({ error: "preset/unknown", ok: false });
    expect(updateTask({ subtasks: { remove: ["s99"] } })).toEqual({
      error: "action/unknown-subtask",
      ok: false,
    });
    // s1 was sent: it stays on the record; s3 is solved: renaming it would lose the mark.
    expect(updateTask({ subtasks: { remove: ["s1"] } })).toEqual({
      error: "subtask/submitted",
      ok: false,
    });
    expect(updateTask({ subtasks: { rename: [{ label: "x", subtaskId: "s3" }] } })).toEqual({
      error: "action/subtask-done",
      ok: false,
    });
  });
});

describe("planAction: task.delete, task.close", () => {
  it("deletes a task by revoking its creation, as the app's trash button does", () => {
    expect(bodies(plan({ kind: "task.delete", taskId: HW_ID }))).toEqual([
      { payload: { targetId: hwCreated(1).id }, type: "event.revoked" },
    ]);
    expect(plan({ kind: "task.delete", taskId: "t-nope" })).toEqual({
      error: "action/unknown-task",
      ok: false,
    });
  });

  it("closes a task with its outcome", () => {
    expect(bodies(plan({ kind: "task.close", outcome: "skipped", taskId: REPLY_ID }))).toEqual([
      { payload: { outcome: "skipped", taskId: REPLY_ID }, type: "task.closed" },
    ]);
    expect(plan({ kind: "task.close", outcome: "done", taskId: "t-nope" })).toEqual({
      error: "action/unknown-task",
      ok: false,
    });
  });
});

describe("planAction: subtasks", () => {
  it("adds subtasks to a task", () => {
    expect(
      bodies(
        plan({ kind: "task.addSubtasks", subtasks: [{ label: "8", number: 8 }], taskId: HW_ID }),
      ),
    ).toEqual([
      {
        payload: { subtasks: [{ id: "id-1", label: "8", number: 8 }], taskId: HW_ID },
        type: "task.subtasks.added",
      },
    ]);
    expect(
      plan({ kind: "task.addSubtasks", subtasks: [{ label: "8", number: 8 }], taskId: "x" }),
    ).toEqual({ error: "action/unknown-task", ok: false });
  });

  it("keeps the message an addition or a mark came from as the task's source", () => {
    const text = "в алгебру добавь 8, а 5 я решил";
    const withSource = (action: ActionBody) =>
      bodies(planAction(artboardState(), action, { ...world, newId: ids(), sourceText: text }));
    expect(
      withSource({
        kind: "task.addSubtasks",
        subtasks: [{ label: "8", number: 8 }],
        taskId: HW_ID,
      }),
    ).toEqual([
      {
        payload: { subtasks: [{ id: "id-1", label: "8", number: 8 }], taskId: HW_ID },
        type: "task.subtasks.added",
      },
      { payload: { sourceText: text, taskId: HW_ID }, type: "task.source.attached" },
    ]);
    expect(withSource({ kind: "task.markSubtasks", subtaskIds: ["s5"], taskId: HW_ID })).toEqual([
      { payload: { subtaskId: "s5", taskId: HW_ID }, type: "task.subtask.solved" },
      { payload: { sourceText: text, taskId: HW_ID }, type: "task.source.attached" },
    ]);
  });

  it("marks the open ones of the named subtasks solved", () => {
    expect(
      bodies(plan({ kind: "task.markSubtasks", subtaskIds: ["s3", "s5"], taskId: HW_ID })),
    ).toEqual([{ payload: { subtaskId: "s5", taskId: HW_ID }, type: "task.subtask.solved" }]);
    expect(plan({ kind: "task.markSubtasks", subtaskIds: ["s3"], taskId: HW_ID })).toEqual({
      error: "action/empty-patch",
      ok: false,
    });
    expect(plan({ kind: "task.markSubtasks", subtaskIds: ["s99"], taskId: HW_ID })).toEqual({
      error: "action/unknown-subtask",
      ok: false,
    });
    expect(plan({ kind: "task.markSubtasks", subtaskIds: ["s5"], taskId: "x" })).toEqual({
      error: "action/unknown-task",
      ok: false,
    });
  });
});

const occurred = (result: ReturnType<typeof plan>): readonly string[] =>
  result.ok ? result.value.map((input: EventInput) => input.occurredAt) : [];

const updateTask = (patch: Extract<ActionBody, { kind: "task.update" }>["patch"], taskId = HW_ID) =>
  plan({ kind: "task.update", patch, taskId });

/** When a start "since" `startAt` begins, over the tracked day. */
const startedAt = (startAt: string) => {
  const action: ActionBody = {
    category: "other",
    expectMinutes: 60,
    kind: "activity.start",
    label: "Военкомат",
    startAt,
  };
  return occurred(plan(action, tracked()));
};

const logBlock = (start: string, end: string) =>
  plan({ category: "other", end, kind: "activity.log", label: "Военкомат", start });

const updateActivity = (
  patch: Extract<ActionBody, { kind: "activity.update" }>["patch"],
  activityId = LOGGED,
) => plan({ activityId, kind: "activity.update", patch }, tracked());

describe("planAction: activity.start", () => {
  it("starts now with the category's expected length when none is given", () => {
    const result = plan({ category: "rest", kind: "activity.start", label: "Nap" }, tracked());
    expect(bodies(result)).toEqual([
      {
        payload: { activityId: "id-1", category: "rest", expectMinutes: 30, label: "Nap" },
        type: "activity.started",
      },
    ]);
    expect(occurred(result)).toEqual([NOW]);
  });

  it("goes back to a start already passed, but not before the activity it takes over from", () => {
    expect(startedAt(minutes(-30))).toEqual([minutes(-30)]);
    // "Work" runs since two hours ago: the new one takes over from it, never before it.
    expect(startedAt(minutes(-300))).toEqual([minutes(-120)]);
    // A start ahead is now.
    expect(startedAt(minutes(1))).toEqual([NOW]);
    expect(startedAt(NOW)).toEqual([NOW]);
  });

  it("refuses a blank label", () => {
    expect(plan({ category: "rest", kind: "activity.start", label: " " })).toEqual({
      error: "action/invalid",
      ok: false,
    });
  });
});

describe("planAction: activity.log", () => {
  it("logs a past block, stamped at its end", () => {
    const result = logBlock(minutes(-90), minutes(-30));
    expect(bodies(result)).toEqual([
      {
        payload: {
          activityId: "id-1",
          category: "other",
          endAt: minutes(-30),
          label: "Военкомат",
          startAt: minutes(-90),
        },
        type: "activity.logged",
      },
    ]);
    expect(occurred(result)).toEqual([minutes(-30)]);
  });

  it("takes a block that ends now, and refuses one that ends a second later", () => {
    expect(logBlock(minutes(-20), NOW).ok).toBe(true);
    const ahead = new Date(Date.parse(NOW) + 1000).toISOString();
    expect(logBlock(minutes(-20), ahead)).toEqual({ error: "retro/future", ok: false });
  });

  it("refuses a block that ends before it starts", () => {
    expect(logBlock(minutes(-20), minutes(-20))).toEqual({ error: "action/invalid", ok: false });
    expect(logBlock(minutes(-20), minutes(-40))).toEqual({ error: "action/invalid", ok: false });
  });
});

describe("planAction: activity.update, activity.delete", () => {
  it("moves and renames a block", () => {
    const moved = updateActivity({
      category: "social",
      end: minutes(-140),
      label: "Lunch with Ann",
    });
    expect(bodies(moved)).toEqual([
      { payload: { activityId: LOGGED, endAt: minutes(-140) }, type: "activity.adjusted" },
      {
        payload: { activityId: LOGGED, category: "social", label: "Lunch with Ann" },
        type: "activity.labelled",
      },
    ]);
  });

  it("refuses an unknown activity, an empty patch, a span turned inside out and the future", () => {
    expect(updateActivity({ label: "x" }, "a-nope")).toEqual({
      error: "action/unknown-activity",
      ok: false,
    });
    expect(updateActivity({})).toEqual({ error: "action/empty-patch", ok: false });
    expect(updateActivity({ end: minutes(-175) })).toEqual({
      error: "action/invalid",
      ok: false,
    });
    expect(updateActivity({ start: minutes(5) }, RUNNING)).toEqual({
      error: "retro/future",
      ok: false,
    });
  });

  it("deletes a logged block by revoking its log entry", () => {
    const state = tracked();
    expect(bodies(plan({ activityId: LOGGED, kind: "activity.delete" }, state))).toEqual([
      {
        payload: { targetId: state.time.activities[LOGGED]?.originEventId },
        type: "event.revoked",
      },
    ]);
    expect(plan({ activityId: "a-nope", kind: "activity.delete" }, state)).toEqual({
      error: "action/unknown-activity",
      ok: false,
    });
  });

  it("deletes a start and keeps the activity it ended stopped where it was", () => {
    const state = tracked();
    const result = plan({ activityId: RUNNING, kind: "activity.delete" }, state);
    expect(bodies(result)).toEqual([
      { payload: { activityId: BEFORE }, type: "activity.stopped" },
      {
        payload: { targetId: state.time.activities[RUNNING]?.originEventId },
        type: "event.revoked",
      },
    ]);
    expect(occurred(result)).toEqual([minutes(-120), NOW]);
  });
});

describe("planActions", () => {
  it("refuses actions after their target was deleted earlier in the same batch", () => {
    expect(
      planActions(
        artboardState(),
        [
          { kind: "task.delete", taskId: BOOKS_ID },
          { kind: "task.update", patch: { title: "Bring back" }, taskId: BOOKS_ID },
        ],
        { ...world, newId: ids() },
      ),
    ).toEqual({ error: { error: "action/unknown-task", index: 1 }, ok: false });
    expect(
      planActions(
        tracked(),
        [
          { activityId: LOGGED, kind: "activity.delete" },
          { activityId: LOGGED, kind: "activity.update", patch: { label: "Still here" } },
        ],
        { ...world, newId: ids() },
      ),
    ).toEqual({ error: { error: "action/unknown-activity", index: 1 }, ok: false });
  });

  it("plans two tasks in order in the same existing project", () => {
    const result = planActions(
      artboardState(),
      [
        {
          kind: "task.create",
          task: draft({ projectId: WORK_ID, title: "Renew the passport" }),
        },
        { kind: "task.create", task: draft({ projectId: WORK_ID, title: "Book the photo" }) },
      ],
      { ...world, newId: ids() },
    );
    const inputs = result.ok ? result.value : [];
    expect(inputs.map((input) => input.type)).toEqual(["task.created", "task.created"]);
    const projects = inputs
      .map((input) => (input.type === "task.created" ? input.payload.projectId : null))
      .filter((projectId) => projectId !== null);
    expect(new Set(projects).size).toBe(1);
  });

  it("refuses the whole batch at the first action that cannot be planned, and says which", () => {
    expect(
      planActions(
        artboardState(),
        [
          { kind: "task.close", outcome: "done", taskId: REPLY_ID },
          { kind: "task.delete", taskId: "t-nope" },
        ],
        { ...world, newId: ids() },
      ),
    ).toEqual({ error: { error: "action/unknown-task", index: 1 }, ok: false });
  });
});
