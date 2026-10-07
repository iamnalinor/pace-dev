import { describe, expect, it } from "vitest";

import type { Event, EventInput } from "../events/event-schema.ts";
import type { CoreState } from "../materialize/core-state.ts";

import { autoOutcomeId } from "../ids.ts";
import { at, event, HW_ID, solved, TRK_ID } from "../materialize/task-fixture.fake.ts";
import { autoOutcomeEvents } from "../outcomes/outcome.ts";
import {
  artboardState,
  CALC_HW5_DUE,
  CALC_HW5_ID,
  ctx,
  INBOX_CABLE_ID,
  INBOX_SYNC_ID,
  INBOX_TEXTS,
  NOW,
  WORK_ID,
} from "../queries/fixture.fake.ts";
import { addMinutesIso } from "../time.ts";
import { validateEventInput } from "../validation/retro-rules.ts";
import { type ReviewItem, reviewItems } from "./to-sort.ts";

const DAY = 24 * 60;
const TOMORROW = addMinutesIso(NOW, DAY);
/** Before TRK-231's Wednesday re-prioritization, which would count as fresh activity. */
const WEDNESDAY_MORNING = "2026-10-07T11:30:00.000Z";
const QUIZ_ID = "t-quiz";

const review = (now: string, extra: readonly Event[] = []): readonly ReviewItem[] =>
  reviewItems(artboardState(now, extra), ctx(now));

const taskIds = (items: readonly ReviewItem[]): readonly string[] =>
  items.map((item) => item.taskId);

const suggestedEvents = (items: readonly ReviewItem[]): readonly EventInput[] =>
  items.flatMap((item) => item.actions.flatMap((entry) => entry.events));

const itemFor = (items: readonly ReviewItem[], taskId: string): ReviewItem => {
  const found = items.find((item) => item.taskId === taskId);
  if (found === undefined) {
    throw new Error(`no review item for ${taskId}`);
  }
  return found;
};

const action = (item: ReviewItem, key: string): readonly EventInput[] => {
  const found = item.actions.find((entry) => entry.key === key);
  if (found === undefined) {
    throw new Error(`no action ${key}`);
  }
  return found.events;
};

type Body<I = EventInput> = I extends { readonly type: unknown; readonly payload: unknown }
  ? Pick<I, "payload" | "type">
  : never;

const input = (occurredAt: string, body: Body): EventInput => ({
  ...body,
  occurredAt,
  precision: "exact",
  source: "app",
});

/** All seven problems solved on Tuesday morning: "submitted?" a day later. */
const allSolved = (): readonly Event[] => [
  solved(90, "2026-10-06T08:10:00.000Z", "s5"),
  solved(91, "2026-10-06T08:20:00.000Z", "s6"),
  solved(92, "2026-10-06T08:30:00.000Z", "s7"),
  at(93, "2026-10-06T11:00:00.000Z", {
    type: "task.progress.set",
    payload: { taskId: TRK_ID, progress: 10 },
  }),
];

/** A work task with a plain id whose hard deadline passed on Monday noon. */
const quiz = (): readonly Event[] => [
  at(96, "2026-10-01T09:00:00.000Z", {
    type: "task.created",
    payload: {
      taskId: QUIZ_ID,
      title: "Quiz prep",
      presetId: "work",
      dueAt: "2026-10-05T12:00:00.000Z",
      dueTz: "UTC",
      subtasks: [],
      fields: {},
    },
  }),
];

/** The automatic outcomes due by `now`, as the client or the server would append them. */
const autoClosed = (state: CoreState, now: string): readonly Event[] =>
  autoOutcomeEvents({
    tasks: state.tasks,
    presets: state.presets,
    now,
    existingEventIds: new Set(),
  }).map((auto, index) => event(200 + index, auto));

describe("reviewItems", () => {
  it("lists what needs sorting, oldest first: the stale inbox item, then the passed deadline", () => {
    const items = reviewItems(artboardState(), ctx());
    expect(items.map((item) => [item.kind, item.taskId, item.since])).toEqual([
      ["unsorted-too-long", INBOX_CABLE_ID, "2026-09-30T12:00:00.000Z"],
      ["deadline-passed", CALC_HW5_ID, CALC_HW5_DUE],
    ]);
  });

  it("offers the outcomes for a deadline that passed without any later event", () => {
    const item = itemFor(reviewItems(artboardState(), ctx()), CALC_HW5_ID);
    expect(item.actions.map((entry) => entry.key)).toEqual([
      "mark-done",
      "cancel",
      "skip",
      "keep-open",
    ]);
    expect(action(item, "mark-done")).toEqual([
      input(NOW, { type: "task.closed", payload: { taskId: CALC_HW5_ID, outcome: "done" } }),
    ]);
    expect(action(item, "cancel")).toEqual([
      input(NOW, { type: "task.closed", payload: { taskId: CALC_HW5_ID, outcome: "cancelled" } }),
    ]);
    expect(action(item, "skip")).toEqual([
      input(NOW, { type: "task.closed", payload: { taskId: CALC_HW5_ID, outcome: "skipped" } }),
    ]);
    expect(action(item, "keep-open")).toEqual([]);
  });

  it("drops the passed deadline once the task sees a later event", () => {
    const state = artboardState(NOW, [
      solved(94, "2026-10-06T08:00:00.000Z", { id: "c4", taskId: CALC_HW5_ID }),
    ]);
    expect(reviewItems(state, ctx()).map((item) => item.taskId)).not.toContain(CALC_HW5_ID);
  });

  it("asks 'submitted?' a day after the last problem was solved", () => {
    const solvedWorld = allSolved();
    expect(taskIds(review(NOW, solvedWorld))).not.toContain(HW_ID);
    const item = itemFor(review(TOMORROW, solvedWorld), HW_ID);
    expect(item).toMatchObject({ kind: "submitted", since: "2026-10-06T08:30:00.000Z" });
    expect(item.actions.map((entry) => entry.key)).toEqual(["submit-now", "keep-open"]);
    expect(action(item, "submit-now")).toEqual([
      input(TOMORROW, {
        type: "task.submitted",
        payload: { taskId: HW_ID, subtaskIds: ["s3", "s4", "s5", "s6", "s7"], closes: true },
      }),
    ]);
  });

  it("asks 'done?' a day after a whole-submission task reached full progress", () => {
    const now = WEDNESDAY_MORNING;
    const solvedWorld = allSolved();
    const item = itemFor(review(now, solvedWorld), TRK_ID);
    expect(item).toMatchObject({ kind: "submitted", since: "2026-10-06T11:00:00.000Z" });
    expect(item.actions.map((entry) => entry.key)).toEqual(["mark-done", "keep-open"]);
    expect(action(item, "mark-done")).toEqual([
      input(now, { type: "task.closed", payload: { taskId: TRK_ID, outcome: "done" } }),
    ]);
    // Any later activity on the task restarts the day: the re-prioritization at noon does.
    expect(taskIds(review(TOMORROW, solvedWorld))).not.toContain(TRK_ID);
  });

  it("offers to sort an inbox item older than three days with its suggestion", () => {
    const item = itemFor(reviewItems(artboardState(), ctx()), INBOX_CABLE_ID);
    expect(item.actions.map((entry) => entry.key)).toEqual(["sort", "cancel"]);
    expect(action(item, "sort")).toEqual([
      input(NOW, {
        type: "task.preset.set",
        payload: { taskId: INBOX_CABLE_ID, presetId: "personal" },
      }),
      input(NOW, {
        type: "task.importance.set",
        payload: { taskId: INBOX_CABLE_ID, importance: "nice_to_have" },
      }),
    ]);
    expect(action(item, "cancel")).toEqual([
      input(NOW, {
        type: "task.closed",
        payload: { taskId: INBOX_CABLE_ID, outcome: "cancelled" },
      }),
    ]);
  });

  it("sorts with the project and the due date when the text names them", () => {
    const state = artboardState(NOW, [
      at(95, "2026-10-01T07:00:00.000Z", {
        type: "task.created",
        payload: {
          taskId: "t-inbox-old",
          title: INBOX_TEXTS[INBOX_SYNC_ID],
          presetId: "inbox",
          sourceText: INBOX_TEXTS[INBOX_SYNC_ID],
          subtasks: [],
          fields: {},
        },
      }),
    ]);
    const item = itemFor(reviewItems(state, ctx()), "t-inbox-old");
    expect(action(item, "sort")).toEqual([
      input(NOW, { type: "task.preset.set", payload: { taskId: "t-inbox-old", presetId: "work" } }),
      input(NOW, {
        type: "task.project.set",
        payload: { taskId: "t-inbox-old", projectId: WORK_ID },
      }),
      input(NOW, {
        type: "task.importance.set",
        payload: { taskId: "t-inbox-old", importance: "prioritized" },
      }),
      input(NOW, {
        type: "task.updated",
        payload: {
          taskId: "t-inbox-old",
          dueAt: "2026-10-09T20:59:00.000Z",
          dueTz: "Europe/Moscow",
        },
      }),
    ]);
  });

  it("asks to confirm or undo an automatic outcome until it is confirmed", () => {
    const base = artboardState(NOW, quiz());
    const closedItems = review(NOW, [...quiz(), ...autoClosed(base, NOW)]);
    const item = itemFor(closedItems, QUIZ_ID);
    const closingId = autoOutcomeId(QUIZ_ID, "missed");
    expect(item).toMatchObject({ kind: "confirm-auto-outcome", since: "2026-10-05T12:00:00.000Z" });
    expect(itemFor(closedItems, CALC_HW5_ID).kind).toBe("confirm-auto-outcome");
    expect(item.actions.map((entry) => entry.key)).toEqual(["confirm", "undo"]);
    expect(action(item, "confirm")).toEqual([
      input(NOW, {
        type: "event.amended",
        payload: { targetId: closingId, patch: { confirmed: true } },
      }),
    ]);
    expect(action(item, "undo")).toEqual([
      input(NOW, { type: "event.revoked", payload: { targetId: closingId } }),
    ]);
    const confirmed = review(NOW, [
      ...quiz(),
      ...autoClosed(base, NOW),
      ...action(item, "confirm").map((correction, index) => event(210 + index, correction)),
    ]);
    expect(taskIds(confirmed)).not.toContain(QUIZ_ID);
    const undone = review(NOW, [
      ...quiz(),
      ...autoClosed(base, NOW),
      ...action(item, "undo").map((correction, index) => event(220 + index, correction)),
    ]);
    expect(itemFor(undone, QUIZ_ID).kind).toBe("deadline-passed");
  });

  it("only ever suggests events the retro rules accept", () => {
    const base = artboardState();
    const worlds: readonly (readonly [CoreState, string])[] = [
      [base, NOW],
      [artboardState(WEDNESDAY_MORNING, allSolved()), WEDNESDAY_MORNING],
      [artboardState(NOW, [...quiz(), ...autoClosed(base, NOW)]), NOW],
    ];
    const checked = worlds.flatMap(([state, now]) =>
      suggestedEvents(reviewItems(state, ctx(now))).map((suggested) =>
        validateEventInput(state, suggested, now),
      ),
    );
    expect(checked.length).toBeGreaterThan(8);
    expect(checked.every((result) => result.ok)).toBe(true);
  });
});
