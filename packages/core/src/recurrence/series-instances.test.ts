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
      taskId: seriesInstanceId(SERIES_ID, 0, 0),
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

describe("recurring task instances", () => {
  it("makes one ahead with a deterministic id, then one for the next occurrence", () => {
    const first = derive([seriesCreated], AT);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: seriesInstanceId(SERIES_ID, 0, 0),
      type: "task.created",
      payload: { startAt: START },
    });
    const firstEvent = firstEventOf(first);
    expect(derive([seriesCreated, firstEvent], AT)).toEqual([]);
    const next = derive([seriesCreated, firstEvent], "2026-10-16T09:01:00.000Z");
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: seriesInstanceId(SERIES_ID, 0, 1),
      payload: {
        startAt: "2026-10-17T09:00:00.000Z",
        dueAt: "2026-10-17T18:00:00.000Z",
        overrides: { deadlinePolicy: { finalAt: "2026-11-01T18:00:00.000Z" } },
      },
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
