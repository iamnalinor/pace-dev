import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { SyncEventSchema } from "./api/schemas/sync.ts";
import { EVENT_ID_MAX } from "./events/event-schema.ts";
import {
  autoOutcomeId,
  createIdFactory,
  deferredReadId,
  instanceId,
  isUlid,
  newId,
  sleepDiscardId,
  sleepReopenId,
  sleepStartId,
  sleepStopId,
} from "./ids.ts";
import {
  MAX_ATTEMPTS,
  seriesArchiveId,
  seriesInstanceId,
  seriesRevisionId,
} from "./recurrence/series-instances.ts";

describe("newId", () => {
  it("makes an id from a fresh factory even for a time of 0 (no counter to increment yet)", () => {
    const make = createIdFactory(() => 0.5);
    expect(isUlid(make(0))).toBe(true);
    expect(isUlid(make(0))).toBe(true);
  });

  it("returns a valid ULID", () => {
    expect(isUlid(newId())).toBe(true);
  });

  it("is monotonic within the same millisecond", () => {
    const make = createIdFactory();
    const ids = Array.from({ length: 50 }, () => make(1_700_000_000_000));
    const sorted = ids.toSorted((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("accepts an injected PRNG for deterministic tests", () => {
    const a = createIdFactory(() => 0.5)(1_700_000_000_000);
    const b = createIdFactory(() => 0.5)(1_700_000_000_000);
    expect(a).toBe(b);
  });
});

const seedArb = fc.integer({ max: 2_000_000_000_000, min: 0 });

describe("isUlid", () => {
  it("accepts generated ids", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        expect(isUlid(newId(seed))).toBe(true);
      }),
    );
  });

  it("rejects garbage", () => {
    expect(isUlid("")).toBe(false);
    expect(isUlid("hw:p:2026-W41")).toBe(false);
    expect(isUlid("01ARZ3NDEKTSV4RRFFQ69G5FA")).toBe(false);
  });
});

describe("deterministic ids", () => {
  it("builds homework instance ids", () => {
    expect(instanceId("preset-1", "2026-W41")).toBe("hw:preset-1:2026-W41");
  });

  it("builds auto outcome ids", () => {
    expect(autoOutcomeId("task-1", "missed")).toBe("auto:task-1:missed");
    expect(autoOutcomeId("task-1", "skipped")).toBe("auto:task-1:skipped");
  });
});

/** The sync carries the id (`SyncEventSchema` reads `EVENT_ID_MAX`). */
const isCarried = (id: string): boolean =>
  id.length <= EVENT_ID_MAX && SyncEventSchema.shape.id.safeParse(id).success;

/** Every server-made id about one series, one task and one night, each at its longest. */
const idsOf = ({
  activity,
  at,
  index,
  preset,
  revision,
  series,
  suffix,
  task,
}: {
  activity: string;
  at: string;
  index: number;
  preset: string;
  revision: string;
  series: string;
  suffix: number;
  task: string;
}): readonly string[] => {
  const instance = instanceId(preset, "2026-W41");
  const repeat = seriesInstanceId(series, revision, index);
  const start = `${sleepStartId("2026-10-07", at)}-${String(suffix)}`;
  const stop = `${sleepStopId(activity, at)}-${String(suffix)}`;
  const retry = `:${String(MAX_ATTEMPTS - 1)}`;
  const outcomes = [task, instance, repeat].flatMap((id) => [
    autoOutcomeId(id, "missed"),
    autoOutcomeId(id, "skipped"),
  ]);
  return [
    instance,
    repeat,
    seriesArchiveId(series),
    `${seriesRevisionId(series, "amend", revision)}${retry}`,
    `${seriesRevisionId(series, "revoke", revision)}${retry}`,
    ...outcomes,
    start,
    stop,
    sleepDiscardId(start),
    sleepReopenId(stop),
    deferredReadId(task, index),
    deferredReadId(task, "inbox"),
  ];
};

describe("every deterministic id fits what the sync carries (class 12)", () => {
  const ulid = fc.integer({ max: 2 ** 40, min: 1 }).map((time) => newId(time));
  // A preset id is a slug of at most 64 characters; its length is what matters here.
  const slug = fc.stringMatching(/^[a-z0-9]{1,64}$/u);
  const instant = fc
    .integer({ max: Date.parse("2100-01-01"), min: Date.parse("2020-01-01") })
    .map((ms) => new Date(ms).toISOString());
  const revision = fc.oneof(fc.constant("0"), ulid);
  const index = fc.nat({ max: 100_000 });
  const suffix = fc.integer({ max: 99, min: 2 });
  const activity = fc.string({ maxLength: EVENT_ID_MAX, minLength: 1 });
  const world = fc.record({
    activity,
    at: instant,
    index,
    preset: slug,
    revision,
    series: ulid,
    suffix,
    task: ulid,
  });

  it("holds for homework, series, outcome, automatic sleep and read-later ids at their longest", () => {
    fc.assert(
      fc.property(world, (world) => {
        expect(idsOf(world).filter((id) => !isCarried(id))).toEqual([]);
      }),
    );
  });

  it("carries a 72-character outcome of an edited series's instance", () => {
    const outcome = autoOutcomeId(seriesInstanceId(newId(), newId(), 12), "missed");
    expect(outcome.length).toBeGreaterThan(64);
    expect(isCarried(outcome)).toBe(true);
  });
});
