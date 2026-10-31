import { describe, expect, it } from "vitest";

import { type Event, type EventInput, type EventOf, parseEvent } from "../events/event-schema.ts";
import { newId } from "../ids.ts";
import { coreReducer, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { materialize } from "../materialize/materializer.ts";
import { missingSeriesEvents, seriesInstanceId } from "./series-instances.ts";

const AT = "2026-10-15T08:00:00.000Z";
const START = "2026-10-16T09:00:00.000Z";
const SERIES_ID = "series-1";

const envelope = (input: EventInput): Event => {
  const parsed = parseEvent({ id: newId(), recordedAt: AT, deviceId: "test", ...input });
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

const seriesCreated = envelope({
  type: "series.created",
  occurredAt: AT,
  precision: "exact",
  source: "app",
  payload: {
    seriesId: SERIES_ID,
    schedule: { kind: "daily" },
    template: {
      taskId: seriesInstanceId(SERIES_ID, "0", 0),
      seriesId: SERIES_ID,
      seriesRevision: 0,
      title: "Exercise",
      presetId: "personal",
      startAt: START,
      startTz: "UTC",
      dueAt: "2026-10-16T18:00:00.000Z",
      dueTz: "UTC",
      subtasks: [],
      fields: {},
      overrides: {
        deadlinePolicy: {
          kind: "resubmission",
          softDays: 2,
          finalMode: "fixed",
          finalAt: "2026-11-01T18:00:00.000Z",
          finalTz: "UTC",
        },
      },
    },
  },
}) as EventOf<"series.created">;

const firstEventOf = (events: readonly EventInput[]): Event => {
  const first = events[0];
  if (first === undefined) {
    throw new Error("Expected a generated event");
  }
  return envelope(first);
};

const derive = (log: readonly Event[], now: string) => {
  const state = materialize(log, coreReducer, INITIAL_CORE_STATE);
  return missingSeriesEvents({
    ...state,
    existingEventIds: new Set(log.map((event) => event.id)),
    now,
  });
};

/** 09:mm on the day the series was made. */
const at = (minute: number): string => `2026-10-15T09:${String(minute).padStart(2, "0")}:00.000Z`;

/** The log with what a derive at 09:mm adds to it. */
const step = (log: readonly Event[], minute: number): readonly Event[] => [
  ...log,
  ...derive(log, at(minute)).map((input) => envelope(input)),
];

const edit = (kind: "monthly" | "weekly", minute: number): Event =>
  envelope({
    type: "series.updated",
    occurredAt: at(minute),
    precision: "exact",
    source: "app",
    payload: { ...seriesCreated.payload, schedule: { kind } },
  });

/** History's undo of an event. */
const undo = (target: Event, minute: number): Event =>
  envelope({
    type: "event.revoked",
    occurredAt: at(minute),
    precision: "exact",
    source: "app",
    payload: { targetId: target.id },
  });

describe("recurring task instances", () => {
  it("makes one ahead with a deterministic id, then one for the next occurrence", () => {
    const first = derive([seriesCreated], AT);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: seriesInstanceId(SERIES_ID, "0", 0),
      type: "task.created",
      payload: { startAt: START },
    });
    const firstEvent = firstEventOf(first);
    expect(derive([seriesCreated, firstEvent], AT)).toEqual([]);
    const next = derive([seriesCreated, firstEvent], "2026-10-16T09:01:00.000Z");
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: seriesInstanceId(SERIES_ID, "0", 1),
      payload: {
        startAt: "2026-10-17T09:00:00.000Z",
        dueAt: "2026-10-17T18:00:00.000Z",
        overrides: { deadlinePolicy: { finalAt: "2026-11-01T18:00:00.000Z" } },
      },
    });
  });

  it("moves a far deadline by the schedule's own months, short months clamped", () => {
    // Made Oct 31, due Jan 31 three months later, every month (Moscow).
    const monthly = envelope({
      ...seriesCreated,
      payload: {
        ...seriesCreated.payload,
        schedule: { kind: "monthly" },
        template: {
          ...seriesCreated.payload.template,
          dueAt: "2027-01-31T20:59:00.000Z",
          dueTz: "Europe/Moscow",
          overrides: {},
          startAt: "2026-10-31T12:27:00.000Z",
          startTz: "Europe/Moscow",
        },
      },
    });
    const first = firstEventOf(derive([monthly], "2026-10-31T12:00:00.000Z"));
    const second = derive([monthly, first], "2026-10-31T12:28:00.000Z");
    expect(second[0]).toMatchObject({
      payload: { dueAt: "2027-02-28T20:59:00.000Z", startAt: "2026-11-30T12:27:00.000Z" },
    });
  });

  it("revises an untouched future instance while leaving a manually edited one alone", () => {
    const first = firstEventOf(derive([seriesCreated], AT));
    if (first.type !== "task.created") {
      throw new Error("Expected a task");
    }
    const update = envelope({
      type: "series.updated",
      occurredAt: "2026-10-15T09:00:00.000Z",
      precision: "exact",
      source: "app",
      payload: { ...seriesCreated.payload, schedule: { kind: "weekly" } },
    });
    const revised = derive([seriesCreated, first, update], "2026-10-15T10:00:00.000Z");
    expect(revised).toHaveLength(1);
    expect(revised[0]).toMatchObject({
      type: "event.amended",
      payload: { targetId: first.id, patch: { seriesRevision: 1 } },
    });
    const edit = envelope({
      type: "task.updated",
      occurredAt: "2026-10-15T08:30:00.000Z",
      precision: "exact",
      source: "app",
      payload: { taskId: first.payload.taskId, title: "Mine" },
    });
    expect(derive([seriesCreated, first, edit, update], "2026-10-15T10:00:00.000Z")).toEqual([]);
  });

  it("removes an untouched future instance when the series is archived", () => {
    const first = firstEventOf(derive([seriesCreated], AT));
    const archive = envelope({
      type: "series.archived",
      occurredAt: "2026-10-15T09:00:00.000Z",
      precision: "exact",
      source: "app",
      payload: { seriesId: SERIES_ID },
    });
    expect(derive([seriesCreated, first, archive], "2026-10-15T10:00:00.000Z")).toMatchObject([
      { type: "event.revoked", payload: { targetId: first.id } },
    ]);
  });
});

describe("recurring task instances after the owner's corrections", () => {
  it("keeps the instance the series was archived from, untouched or not", () => {
    const first = firstEventOf(derive([seriesCreated], AT));
    if (first.type !== "task.created") {
      throw new Error("Expected a task");
    }
    const archive = envelope({
      type: "series.archived",
      occurredAt: "2026-10-15T09:00:00.000Z",
      precision: "exact",
      source: "app",
      payload: { seriesId: SERIES_ID, keepTaskId: first.payload.taskId },
    });
    expect(derive([seriesCreated, first, archive], "2026-10-15T10:00:00.000Z")).toEqual([]);
  });

  it("follows a schedule edited again after an edit was undone in History", () => {
    const weekly = edit("weekly", 1);
    const log0 = step([seriesCreated], 0);
    const log1 = step([...log0, weekly], 2);
    const log2 = step([...log1, undo(weekly, 3)], 4);
    const monthly = edit("monthly", 5);
    const log3 = step([...log2, monthly], 6);
    const state = materialize(log3, coreReducer, INITIAL_CORE_STATE);
    const open = Object.values(state.tasks.byId).filter((task) => task.closed === null);
    expect(open).toHaveLength(1);
    expect(open[0]?.seriesRevision).toBe(state.series.byId[SERIES_ID]?.revision);
    expect(derive(log3, at(7))).toEqual([]);
    // Undo the monthly edit too: the instance follows back to daily.
    const log4 = step([...log3, undo(monthly, 8)], 9);
    const back = materialize(log4, coreReducer, INITIAL_CORE_STATE);
    expect(
      Object.values(back.tasks.byId).find((task) => task.closed === null)?.seriesRevision,
    ).toBe(0);
    expect(derive(log4, at(10))).toEqual([]);
  });
});
