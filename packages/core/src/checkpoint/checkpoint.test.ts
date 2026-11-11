import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";

import { coreReducer, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { materialize } from "../materialize/materializer.ts";
import { at, hwCreated, stamp } from "../materialize/task-fixture.fake.ts";
import { yearOfUse } from "../materialize/year-of-use.fake.ts";
import {
  checkpointCutoff,
  createCheckpoint,
  parseCheckpoint,
  replayCheckpoint,
} from "./checkpoint.ts";

const metadata = {
  build: "materializer-v1",
  cutoff: "2026-10-01T00:00:00.000Z",
  cutoffTimezone: "UTC",
  storeId: "store-a",
};
const recordsOf = (events: readonly Event[], offset = 0) =>
  events.map((event, index) => ({ event, seq: offset + index + 1 }));
const snapshotOf = (events: readonly Event[]) => {
  const result = createCheckpoint({
    ...metadata,
    coveredSeq: events.length,
    records: recordsOf(events),
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};
const later = (index: number): Event =>
  at(index, "2026-12-01T00:00:00.000Z", {
    payload: { taskId: "hw:hw.algebra:2026-W41", title: `Edited ${index}` },
    type: "task.updated",
  });

describe("checkpoint", () => {
  it("round-trips a complete state with an old open task and all correction ids", () => {
    const events = [
      hwCreated(),
      at(2, "2026-10-06T00:00:00.000Z", {
        type: "event.amended",
        payload: { targetId: stamp(1), patch: { title: "Corrected" } },
      }),
    ];
    const snapshot = snapshotOf(events);
    expect(snapshot.state.tasks.byId["hw:hw.algebra:2026-W41"]?.title).toBe("Corrected");
    expect(snapshot.eventIds).toEqual([stamp(1), stamp(2)]);
    expect(snapshot.lastEffective).toEqual({
      id: stamp(1),
      occurredAt: "2026-10-05T07:00:00.000Z",
    });
    const serialized = JSON.stringify(snapshot);
    const restored: unknown = JSON.parse(serialized);
    expect(parseCheckpoint(restored)).toEqual({
      ok: true,
      value: snapshot,
    });
    expect(Object.hasOwn(snapshot, "records")).toBe(false);
  });

  it("replays empty and ordinary suffixes without mutating its inputs", () => {
    const snapshot = snapshotOf([hwCreated()]);
    const before = structuredClone(snapshot);
    const tail = recordsOf([later(2)], 1);
    const replay = replayCheckpoint(snapshot, tail);
    expect(replay).toEqual({
      ok: true,
      value: {
        ids: [stamp(1), stamp(2)],
        lastEffective: { id: stamp(2), occurredAt: "2026-12-01T00:00:00.000Z" },
        seq: 2,
        state: materialize([hwCreated(), later(2)], coreReducer, INITIAL_CORE_STATE),
      },
    });
    expect(snapshot).toEqual(before);
    expect(replayCheckpoint(snapshotOf([]), [])).toEqual({
      ok: true,
      value: { state: INITIAL_CORE_STATE, ids: [], lastEffective: null, seq: 0 },
    });
  });

  it("deduplicates ids across the base, covered cursor and tail", () => {
    const snapshot = snapshotOf([hwCreated()]);
    const replay = replayCheckpoint(snapshot, [
      { seq: 1, event: hwCreated() },
      { seq: 2, event: { ...later(2), id: stamp(1) } },
      { seq: 3, event: later(3) },
      { seq: 4, event: later(3) },
    ]);
    expect(replay.ok && replay.value.ids).toEqual([stamp(1), stamp(3)]);
    expect(replay.ok && replay.value.seq).toBe(4);
    expect(replay.ok && replay.value.state.tasks.byId["hw:hw.algebra:2026-W41"]?.title).toBe(
      "Edited 3",
    );
  });

  it("requests source replay for corrections, late backdates and a same-time lower id", () => {
    const base = later(5);
    const snapshot = snapshotOf([hwCreated(), base]);
    const unsafe: readonly Event[] = [
      { ...later(3), occurredAt: "2026-10-07T00:00:00.000Z" },
      later(4),
      at(6, base.occurredAt, { type: "event.revoked", payload: { targetId: stamp(1) } }),
      at(7, base.occurredAt, {
        type: "event.amended",
        payload: { targetId: stamp(1), patch: { title: "" } },
      }),
      at(8, base.occurredAt, { type: "event.revoked", payload: { targetId: stamp(7) } }),
    ];
    for (const event of unsafe) {
      expect(replayCheckpoint(snapshot, [{ seq: 3, event }])).toEqual({
        ok: false,
        error: "checkpoint/rebuild-required",
      });
    }
  });

  it("requests rebuilding when a prior correction's formerly unknown target arrives", () => {
    const correction = at(1, "2026-10-06T00:00:00.000Z", {
      type: "event.revoked",
      payload: { targetId: stamp(2) },
    });
    const snapshot = snapshotOf([correction]);
    expect(replayCheckpoint(snapshot, [{ seq: 2, event: hwCreated(2) }])).toEqual({
      ok: false,
      error: "checkpoint/rebuild-required",
    });
  });

  it("materializes correction chains, cycles and invalid amendments exactly like full replay", () => {
    const events = [
      hwCreated(),
      at(2, "2026-10-06T00:00:00.000Z", { type: "event.revoked", payload: { targetId: stamp(3) } }),
      at(3, "2026-10-06T00:00:00.000Z", { type: "event.revoked", payload: { targetId: stamp(2) } }),
      at(4, "2026-10-06T00:00:00.000Z", {
        type: "event.amended",
        payload: { targetId: stamp(1), patch: { title: "" } },
      }),
      at(5, "2026-10-06T00:00:00.000Z", { type: "event.revoked", payload: { targetId: stamp(4) } }),
    ];
    expect(snapshotOf(events).state).toEqual(materialize(events, coreReducer, INITIAL_CORE_STATE));
  });

  it("rejects malformed metadata and source cursor/id evidence", () => {
    for (const patch of [
      { build: "" },
      { storeId: "" },
      { cutoff: "bad" },
      { cutoffTimezone: "bad" },
      { coveredSeq: -1 },
    ]) {
      expect(createCheckpoint({ ...metadata, coveredSeq: 0, records: [], ...patch }).ok).toBe(
        false,
      );
    }
    for (const records of [
      [{ seq: 0, event: hwCreated() }],
      [{ seq: 2, event: hwCreated() }],
      [
        { seq: 1, event: hwCreated() },
        { seq: 1, event: later(2) },
      ],
      [
        { seq: 1, event: hwCreated() },
        { seq: 2, event: hwCreated() },
      ],
    ]) {
      expect(createCheckpoint({ ...metadata, coveredSeq: 1, records }).ok).toBe(false);
    }
    expect(
      replayCheckpoint(snapshotOf([]), [
        { seq: 2, event: later(2) },
        { seq: 1, event: hwCreated() },
      ]),
    ).toEqual({ ok: false, error: "checkpoint/invalid-records" });
  });

  it("fails closed on corrupt version, counts, map identity, last key or any state slice", () => {
    const snapshot = snapshotOf([hwCreated()]);
    const corruptions = [
      { ...snapshot, correctionTargets: [""] },
      { ...snapshot, correctionTargets: [stamp(2), stamp(2)] },
      { ...snapshot, version: 2 },
      { ...snapshot, eventCount: 2 },
      { ...snapshot, eventIds: [stamp(1), stamp(1)], eventCount: 2 },
      { ...snapshot, lastEffective: { id: stamp(9), occurredAt: snapshot.cutoff } },
      {
        ...snapshot,
        state: {
          ...snapshot.state,
          tasks: { byId: { bad: snapshot.state.tasks.byId["hw:hw.algebra:2026-W41"] } },
        },
      },
    ];
    for (const slice of ["tasks", "projects", "presets", "settings", "time", "series"]) {
      corruptions.push({ ...snapshot, state: { ...snapshot.state, [slice]: {} } });
    }
    for (const value of corruptions) {
      expect(parseCheckpoint(value)).toEqual({ ok: false, error: "checkpoint/invalid-snapshot" });
    }
  });

  it("matches full replay or explicitly requests rebuilding for arbitrary source-prefix splits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 150 }),
        fc.nat(),
        fc.nat(),
        (count, seed, splitSeed) => {
          const events = yearOfUse(count, seed);
          const split = splitSeed % (events.length + 1);
          const snapshot = snapshotOf(events.slice(0, split));
          const replay = replayCheckpoint(snapshot, recordsOf(events.slice(split), split));
          const full = materialize(events, coreReducer, INITIAL_CORE_STATE);
          expect(replay.ok ? replay.value.state : replay.error).toEqual(
            replay.ok ? full : "checkpoint/rebuild-required",
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  it("matches full replay on every safe ordinary suffix, including same-time higher ids", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        (prefix, suffix) => {
          const events = [
            hwCreated(),
            ...Array.from({ length: prefix + suffix }, (_, index) => later(index + 2)),
          ];
          const split = prefix + 1;
          const replay = replayCheckpoint(
            snapshotOf(events.slice(0, split)),
            recordsOf(events.slice(split), split),
          );
          expect(replay.ok && replay.value.state).toEqual(
            materialize(events, coreReducer, INITIAL_CORE_STATE),
          );
        },
      ),
    );
  });
});

describe("checkpointCutoff", () => {
  it.each([
    ["2026-04-01T12:00:00.000Z", "America/New_York", "2026-03-02T05:00:00.000Z"],
    ["2026-11-20T12:00:00.000Z", "America/New_York", "2026-10-21T04:00:00.000Z"],
    ["2026-11-06T22:30:00.000Z", "Europe/Moscow", "2026-10-07T21:00:00.000Z"],
  ])("uses a complete local-day boundary across DST: %s in %s", (now, timezone, expected) => {
    expect(checkpointCutoff(now, timezone)).toEqual({ ok: true, value: expected });
  });
  it("returns a validation result for invalid instants and zones", () => {
    expect(checkpointCutoff("bad", "UTC")).toEqual({
      ok: false,
      error: "checkpoint/invalid-metadata",
    });
    expect(checkpointCutoff("2026-11-06T00:00:00.000Z", "bad")).toEqual({
      ok: false,
      error: "checkpoint/invalid-metadata",
    });
  });
});
