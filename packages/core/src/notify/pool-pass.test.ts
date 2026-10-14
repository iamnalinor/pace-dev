import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";

import { coreReducer, type CoreState, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { materializeAt } from "../materialize/materializer.ts";
import { at } from "../materialize/task-fixture.fake.ts";
import { addMinutesIso } from "../time.ts";
import { activityLabel } from "../tracking/calendar-run.ts";
import {
  INITIAL_POOL_MEMORY,
  type OpenNotification,
  type PoolCalendarEvent,
  type PoolInputs,
  poolPass,
} from "./pool-pass.ts";
import { calendarEventKey, overrunRef } from "./pool.ts";

const MOSCOW = "Europe/Moscow";
/** Wednesday October 7, 10:00 Moscow: after the 09:00 slot, before the 14:00 one. */
const MORNING = "2026-10-07T07:00:00.000Z";
const NINE = "2026-10-07T06:00:00.000Z";

const base = (): readonly Event[] => [
  at(0, "2026-10-01T06:00:00.000Z", { type: "settings.updated", payload: { timezone: MOSCOW } }),
];

const stateAt = (now: string, events: readonly Event[] = []): CoreState =>
  materializeAt([...base(), ...events], now, { initial: INITIAL_CORE_STATE, reducer: coreReducer });

const pass = (
  now: string,
  more: Partial<PoolInputs> & { readonly events?: readonly Event[] } = {},
) =>
  poolPass({
    calendar: [],
    memory: { ...INITIAL_POOL_MEMORY, digestSlot: NINE },
    now,
    open: [],
    ruledSeries: [],
    state: stateAt(now, more.events),
    zone: MOSCOW,
    ...more,
  });

const seminar: PoolCalendarEvent = {
  endAt: "2026-10-07T09:30:00.000Z",
  series: "weekly-seminar",
  startAt: "2026-10-07T08:00:00.000Z",
  title: "Seminar",
};

const report = at(1, "2026-10-01T06:00:00.000Z", {
  type: "task.created",
  payload: {
    dueAt: "2026-10-08T09:00:00.000Z",
    dueTz: MOSCOW,
    fields: {},
    importance: "normal",
    presetId: "personal",
    subtasks: [],
    taskId: "t-report",
    title: "Write the report",
  },
});

describe("the deadline digest in a pass", () => {
  it("sends at a slot what is due within a day of the next one, once per task and deadline", () => {
    const twoPm = "2026-10-07T11:05:00.000Z";
    const first = pass(twoPm, { events: [report] });
    expect(first.created).toEqual([
      {
        kind: "deadline_digest",
        payload: {
          slot: "2026-10-07T11:00:00.000Z",
          tasks: [
            {
              dueAt: "2026-10-08T09:00:00.000Z",
              dueTz: MOSCOW,
              taskId: "t-report",
              title: "Write the report",
            },
          ],
        },
      },
    ]);
    expect(first.memory.digestSlot).toBe("2026-10-07T11:00:00.000Z");
    // The 21:00 slot: the task was reported at this deadline already.
    const evening = "2026-10-07T18:01:00.000Z";
    expect(pass(evening, { events: [report], memory: first.memory }).created).toEqual([]);
  });

  it("forgets what it reported about a task once the task is closed", () => {
    const first = pass("2026-10-07T11:05:00.000Z", { events: [report] });
    expect(first.memory.reported).toHaveLength(1);
    const closed = at(2, "2026-10-07T12:00:00.000Z", {
      payload: { outcome: "done", taskId: "t-report" },
      type: "task.closed",
    });
    const evening = pass("2026-10-07T18:01:00.000Z", {
      events: [report, closed],
      memory: first.memory,
    });
    expect(evening.memory.reported).toEqual([]);
  });

  it("sends nothing for an empty slot and arms for the next one", () => {
    const result = pass("2026-10-07T11:05:00.000Z");
    expect(result.created).toEqual([]);
    expect(result.memory.digestSlot).toBe("2026-10-07T11:00:00.000Z");
    expect(result.nextAt).toBe("2026-10-07T18:00:00.000Z");
  });

  it("is never held back by the quiet hours", () => {
    const late = { quietHours: { from: "20:00", to: "08:00" } };
    const settings = at(9, "2026-10-01T07:00:00.000Z", { type: "settings.updated", payload: late });
    const evening = "2026-10-07T18:01:00.000Z";
    expect(
      pass(evening, { events: [report, settings], memory: INITIAL_POOL_MEMORY }).created,
    ).toHaveLength(1);
  });
});

describe("an event starting", () => {
  it("is announced at its start, not before, and once", () => {
    const before = pass(addMinutesIso(seminar.startAt, -1), { calendar: [seminar] });
    expect(before.created).toEqual([]);
    expect(before.nextAt).toBe(seminar.startAt);
    const at0 = pass(seminar.startAt, { calendar: [seminar] });
    expect(at0.created).toEqual([
      {
        kind: "event_start",
        payload: {
          end: seminar.endAt,
          eventKey: calendarEventKey(seminar),
          start: seminar.startAt,
          title: "Seminar",
        },
      },
    ]);
    expect(
      pass(addMinutesIso(seminar.startAt, 5), { calendar: [seminar], memory: at0.memory }).created,
    ).toEqual([]);
  });

  it("is not announced for a series answered for good, nor once attended or over", () => {
    const now = addMinutesIso(seminar.startAt, 1);
    expect(pass(now, { calendar: [seminar], ruledSeries: ["weekly-seminar"] }).created).toEqual([]);
    const attended = at(5, addMinutesIso(seminar.startAt, -5), {
      type: "activity.started",
      payload: { activityId: "a-1", category: "other", label: "Seminar" },
    });
    expect(pass(now, { calendar: [seminar], events: [attended] }).created).toEqual([]);
    expect(pass(seminar.endAt, { calendar: [seminar] }).created).toEqual([]);
  });

  it("counts as attended the way the app does: from fifteen minutes early, by the stored label", () => {
    const early = at(5, addMinutesIso(seminar.startAt, -12), {
      type: "activity.started",
      payload: { activityId: "a-early", category: "other", label: "Seminar" },
    });
    expect(pass(seminar.startAt, { calendar: [seminar], events: [early] }).created).toEqual([]);
    const long: PoolCalendarEvent = {
      ...seminar,
      series: null,
      title: `Seminar ${"x".repeat(120)}`,
    };
    const attended = at(6, addMinutesIso(long.startAt, 2), {
      type: "activity.started",
      payload: { activityId: "a-long", category: "other", label: activityLabel(long.title) },
    });
    const open: OpenNotification = {
      id: "n-long",
      kind: "event_start",
      payload: { end: long.endAt, eventKey: "k", start: long.startAt, title: long.title },
    };
    const during = addMinutesIso(long.startAt, 5);
    expect(pass(during, { events: [attended], open: [open] }).settled).toEqual([
      { id: "n-long", resolution: "attended" },
    ]);
  });

  it("is held back (and not asked later) during the quiet hours", () => {
    const night: PoolCalendarEvent = {
      endAt: "2026-10-07T21:00:00.000Z",
      series: null,
      startAt: "2026-10-07T20:30:00.000Z",
      title: "Late call",
    };
    const held = pass(night.startAt, { calendar: [night] });
    expect(held.created).toEqual([]);
    expect(
      pass(addMinutesIso(night.startAt, 10), { calendar: [night], memory: held.memory }).created,
    ).toEqual([]);
  });

  it("settles an open one as attended once tracked anywhere, else as expired at its end", () => {
    const open: OpenNotification = {
      id: "n-1",
      kind: "event_start",
      payload: { end: seminar.endAt, eventKey: "k", start: seminar.startAt, title: "Seminar" },
    };
    const during = addMinutesIso(seminar.startAt, 10);
    expect(pass(during, { open: [open] }).settled).toEqual([]);
    expect(pass(during, { open: [open] }).nextAt).toBe(seminar.endAt);
    const attended = at(5, addMinutesIso(seminar.startAt, 2), {
      type: "activity.started",
      payload: { activityId: "a-1", category: "other", label: "Seminar" },
    });
    expect(pass(during, { events: [attended], open: [open] }).settled).toEqual([
      { id: "n-1", resolution: "attended" },
    ]);
    expect(pass(seminar.endAt, { open: [open] }).settled).toEqual([
      { id: "n-1", resolution: "expired" },
    ]);
  });

  it("is announced exactly when the instant is within [start, end) of a fresh event", () => {
    fc.assert(
      fc.property(fc.integer({ max: 150, min: -60 }), (offset) => {
        const now = addMinutesIso(seminar.startAt, offset);
        const created = pass(now, { calendar: [{ ...seminar, series: null }] }).created;
        expect(created).toHaveLength(now >= seminar.startAt && now < seminar.endAt ? 1 : 0);
      }),
    );
  });
});

describe("still doing X?", () => {
  const commute = at(3, MORNING, {
    type: "activity.started",
    payload: { activityId: "a-commute", category: "commute", expectMinutes: 30, label: "Commute" },
  });
  const crossed = addMinutesIso(MORNING, 60);

  it("arms for twice the Expect and asks once", () => {
    expect(pass(addMinutesIso(MORNING, 30), { events: [commute] }).nextAt).toBe(crossed);
    const asked = pass(crossed, { events: [commute] });
    expect(asked.created).toEqual([
      {
        kind: "activity_overrun",
        payload: {
          activityId: "a-commute",
          askedAt: crossed,
          expectMinutes: 30,
          label: "Commute",
          startAt: MORNING,
        },
      },
    ]);
    expect(asked.memory.asked).toEqual([overrunRef({ activityId: "a-commute", askedAt: crossed })]);
    expect(
      pass(addMinutesIso(crossed, 5), { events: [commute], memory: asked.memory }).created,
    ).toEqual([]);
  });

  it("waits for the end of the quiet hours", () => {
    const night = at(3, "2026-10-07T19:00:00.000Z", {
      type: "activity.started",
      payload: { activityId: "a-film", category: "rest", expectMinutes: 60, label: "Film" },
    });
    const result = pass("2026-10-07T21:00:00.000Z", { events: [night] });
    expect(result.created).toEqual([]);
    expect(result.nextAt).toBe("2026-10-08T05:00:00.000Z");
  });

  const open: OpenNotification = {
    id: "n-2",
    kind: "activity_overrun",
    payload: {
      activityId: "a-commute",
      askedAt: crossed,
      expectMinutes: 30,
      label: "Commute",
      startAt: MORNING,
    },
  };

  it("settles as stopped once the activity stops, as still once a yes moves the ask on", () => {
    const later = addMinutesIso(crossed, 10);
    expect(pass(later, { events: [commute], open: [open] }).settled).toEqual([]);
    const stopped = at(4, addMinutesIso(crossed, 5), {
      type: "activity.stopped",
      payload: { activityId: "a-commute" },
    });
    expect(pass(later, { events: [commute, stopped], open: [open] }).settled).toEqual([
      { id: "n-2", resolution: "stopped" },
    ]);
    const yes = at(4, addMinutesIso(crossed, 5), {
      type: "activity.labelled",
      payload: { activityId: "a-commute", stillAt: addMinutesIso(crossed, 5) },
    });
    expect(pass(later, { events: [commute, yes], open: [open] }).settled).toEqual([
      { id: "n-2", resolution: "still" },
    ]);
  });
});
