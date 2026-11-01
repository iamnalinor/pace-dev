import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type Event, type EventInput, type EventOf, parseEvent } from "../events/event-schema.ts";
import { newId } from "../ids.ts";
import { coreReducer, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { materialize } from "../materialize/materializer.ts";
import { formatInZone } from "../time.ts";
import { missingSeriesEvents, seriesInstanceId } from "./series-instances.ts";
import { seriesAnchor } from "./series.ts";

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

/** A minute of the day as the person's "HH:mm". */
const clockOf = (minutes: number): string => {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
};

describe("the next instance's time of day (QA round 14 L10e, round 11 M3)", () => {
  const MOSCOW = "Europe/Moscow";
  // Any instant in 2026-2027: the series is made at any minute of any day.
  const madeAt = fc
    .integer({
      max: Date.parse("2027-12-31T00:00:00.000Z"),
      min: Date.parse("2026-01-01T00:00:00.000Z"),
    })
    .map((ms) => new Date(ms).toISOString());
  const schedules = fc.constantFrom(
    { kind: "daily" } as const,
    { kind: "monthly" } as const,
    { kind: "weekly" } as const,
    { days: 3, kind: "every_n_days" } as const,
  );

  /**
  A series made at `made` (Moscow) counting from `anchor`, and its first instance as the app
  writes it: starting at the chosen start, else at the minute it was made.
  */
  const madeSeries = (
    made: string,
    schedule: EventOf<"series.created">["payload"]["schedule"],
    anchor: { readonly at: string; readonly first: string },
  ): readonly Event[] => {
    const { dueAt: _dueAt, dueTz: _dueTz, ...template } = seriesCreated.payload.template;
    const series = envelope({
      ...seriesCreated,
      occurredAt: made,
      payload: {
        ...seriesCreated.payload,
        schedule,
        template: { ...template, overrides: {}, startAt: anchor.at, startTz: MOSCOW },
      },
    });
    const first = envelope({
      id: template.taskId,
      type: "task.created",
      occurredAt: made,
      precision: "exact",
      source: "system",
      payload: { ...template, overrides: {}, startAt: anchor.first, startTz: MOSCOW },
    });
    return [series, first];
  };

  /** The instance the series makes after the first, seen a minute after the series was made. */
  const nextStart = (log: readonly Event[], made: string): string => {
    const minuteLater = new Date(Date.parse(made) + 60_000).toISOString();
    const next = firstEventOf(derive(log, minuteLater));
    if (next.type !== "task.created" || next.payload.startAt === undefined) {
      throw new Error("Expected the next instance");
    }
    return next.payload.startAt;
  };

  it("starts at the start of its day when the person chose no start, whatever minute the series was made", () => {
    fc.assert(
      fc.property(madeAt, schedules, (made, schedule) => {
        const anchor = seriesAnchor(undefined, { at: made, tz: MOSCOW });
        const next = nextStart(madeSeries(made, schedule, { at: anchor, first: made }), made);
        expect(formatInZone(next, MOSCOW, "HH:mm")).toBe("00:00");
        expect(
          formatInZone(next, MOSCOW, "yyyy-MM-dd") > formatInZone(made, MOSCOW, "yyyy-MM-dd"),
        ).toBe(true);
      }),
    );
  });

  it("starts at the series' own time of day when the person chose a start", () => {
    fc.assert(
      fc.property(
        madeAt,
        schedules,
        fc.integer({ max: 24 * 60 - 1, min: 0 }).map((minutes) => clockOf(minutes)),
        (made, schedule, time) => {
          const day = formatInZone(made, MOSCOW, "yyyy-MM-dd");
          // The chosen start, on the day after the series was made, at a time of the person's.
          const chosen = new Date(
            Date.parse(`${day}T${time}:00.000+03:00`) + 86_400_000,
          ).toISOString();
          const anchor = seriesAnchor(chosen, { at: made, tz: MOSCOW });
          expect(anchor).toBe(chosen);
          const next = nextStart(madeSeries(made, schedule, { at: anchor, first: chosen }), chosen);
          expect(formatInZone(next, MOSCOW, "HH:mm")).toBe(time);
        },
      ),
    );
  });
});
