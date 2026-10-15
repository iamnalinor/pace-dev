import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";

import { coreReducer, type CoreState, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { materialize } from "../materialize/materializer.ts";
import { at } from "../materialize/task-fixture.fake.ts";
import { addMinutesIso } from "../time.ts";
import { deadlineDigest, digestSlotAt, reportedKey } from "./deadline-digest.ts";

const MOSCOW = "Europe/Moscow";
/** Wednesday October 7, 09:00 Moscow: a slot; the next one is 14:00 (the default windows). */
const SLOT = "2026-10-07T06:00:00.000Z";
const NEXT = "2026-10-07T11:00:00.000Z";
const HOUR = 60;

type TaskSpec = {
  readonly index: number;
  readonly id: string;
  readonly dueAt: null | string;
  readonly extra?: object;
};

const taskOf = ({ dueAt, extra = {}, id, index }: TaskSpec): Event =>
  at(index, "2026-10-01T06:00:00.000Z", {
    type: "task.created",
    payload: {
      taskId: id,
      title: `Task ${id}`,
      presetId: "personal",
      importance: "normal",
      subtasks: [],
      fields: {},
      ...(dueAt !== null && { dueAt, dueTz: MOSCOW }),
      ...extra,
    },
  });

const task = (index: number, id: string, dueAt: null | string): Event =>
  taskOf({ dueAt, id, index });

const stateOf = (events: readonly Event[]): CoreState =>
  materialize(
    [
      at(0, "2026-10-01T05:00:00.000Z", {
        type: "settings.updated",
        payload: { timezone: MOSCOW },
      }),
      ...events,
    ],
    coreReducer,
    INITIAL_CORE_STATE,
  );

const ids = (state: CoreState, reported: readonly string[] = [], nextSlot = NEXT) =>
  deadlineDigest(state, { nextSlot, reported, slot: SLOT }).map((row) => row.taskId);

describe("deadlineDigest", () => {
  it("lists a task due 30 h after a 09:00 slot when the next is at 21:00 (it would be under 24 h by then)", () => {
    const evening = "2026-10-07T18:00:00.000Z";
    const state = stateOf([task(1, "a", addMinutesIso(SLOT, 30 * HOUR))]);
    expect(ids(state, [], evening)).toEqual(["a"]);
  });

  it("leaves a task due in 50 h for a later slot, while it still has more than a day", () => {
    const evening = "2026-10-07T18:00:00.000Z";
    const state = stateOf([task(1, "a", addMinutesIso(SLOT, 50 * HOUR))]);
    expect(ids(state, [], evening)).toEqual([]);
  });

  it("lists a task created late with 10 h left at the next slot", () => {
    const state = stateOf([task(1, "late", addMinutesIso(SLOT, 10 * HOUR))]);
    expect(ids(state)).toEqual(["late"]);
  });

  it("leaves out what is past due, closed, without a deadline or in the inbox", () => {
    const state = stateOf([
      task(1, "past", addMinutesIso(SLOT, -1)),
      task(2, "none", null),
      taskOf({
        dueAt: addMinutesIso(SLOT, HOUR),
        extra: { presetId: "inbox" },
        id: "inbox",
        index: 3,
      }),
      task(4, "closed", addMinutesIso(SLOT, HOUR)),
      at(5, "2026-10-02T06:00:00.000Z", {
        type: "task.closed",
        payload: { outcome: "done", taskId: "closed" },
      }),
      task(6, "open", addMinutesIso(SLOT, 2 * HOUR)),
    ]);
    expect(ids(state)).toEqual(["open"]);
  });

  it("sorts by deadline", () => {
    const state = stateOf([
      task(1, "later", addMinutesIso(SLOT, 20 * HOUR)),
      task(2, "sooner", addMinutesIso(SLOT, 3 * HOUR)),
    ]);
    expect(ids(state)).toEqual(["sooner", "later"]);
  });

  it("reports each task at a deadline once, and again when the deadline moves", () => {
    const due = addMinutesIso(SLOT, 5 * HOUR);
    const state = stateOf([task(1, "a", due)]);
    expect(ids(state, [reportedKey("a", due)])).toEqual([]);
    const earlier = reportedKey("a", addMinutesIso(due, -HOUR));
    expect(ids(state, [earlier])).toEqual(["a"]);
  });

  it("includes exactly the deadlines in (slot, next slot + 24 h]", () => {
    fc.assert(
      fc.property(fc.integer({ max: 3 * 24 * HOUR, min: -HOUR }), (minutes) => {
        const due = addMinutesIso(SLOT, minutes);
        const state = stateOf([task(1, "a", due)]);
        const isListed = ids(state).length === 1;
        expect(isListed).toBe(due > SLOT && due <= addMinutesIso(NEXT, 24 * HOUR));
      }),
    );
  });
});

describe("digestSlotAt", () => {
  const settings = { digestWindows: ["09:00", "21:00"] };

  it("answers the slot just passed and the one after it, tomorrow's when need be", () => {
    expect(digestSlotAt(addMinutesIso(SLOT, 5), MOSCOW, settings)).toEqual({
      next: "2026-10-07T18:00:00.000Z",
      slot: SLOT,
    });
    expect(digestSlotAt("2026-10-07T18:10:00.000Z", MOSCOW, settings)).toEqual({
      next: "2026-10-08T06:00:00.000Z",
      slot: "2026-10-07T18:00:00.000Z",
    });
  });

  it("skips a slot more than 90 minutes late", () => {
    expect(digestSlotAt(addMinutesIso(SLOT, 90), MOSCOW, settings)?.slot).toBe(SLOT);
    expect(digestSlotAt(addMinutesIso(SLOT, 91), MOSCOW, settings)).toBeNull();
  });

  it("has none without digest times", () => {
    expect(digestSlotAt(SLOT, MOSCOW, { digestWindows: [] })).toBeNull();
  });
});
