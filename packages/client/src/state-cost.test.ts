import { describe, expect, it } from "vitest";

import { yearOfUse } from "@pace/core/testing";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { type AppStateHandle, createAppState } from "./state.ts";

const ACTIONS = 30;
const RATIO_MAX = 5;
/** One frame at 60 Hz: an action shows in the next one. */
const FRAME_MS = 16;

type Seeded = { readonly state: AppStateHandle; readonly lastMs: number };

/** An app state loaded with a year of `size` events of the owner's use. */
const seeded = async (size: number): Promise<Seeded> => {
  const seed = yearOfUse(size, 7);
  const store = createMemoryEventStore();
  await store.append(seed, await store.readMeta());
  await store.markSynced(
    seed.map((event) => event.id),
    await store.readMeta(),
  );
  const lastMs = Date.parse(seed.at(-1)?.occurredAt ?? "2026-01-01T00:00:00.000Z");
  const now = (): string => new Date(lastMs + 86_400_000).toISOString();
  const state = createAppState({ deviceId: "phone", now, source: "app", store });
  await state.ready;
  return { lastMs, state };
};

/** How long one action (a start, in order after everything) takes to show; its write settles after. */
const actionMs = async ({ lastMs, state }: Seeded, index: number): Promise<number> => {
  const occurredAt = new Date(lastMs + (index + 1) * 60_000).toISOString();
  const start = performance.now();
  const staged = await state.stage([
    {
      occurredAt,
      payload: { activityId: `cost-${index}`, category: "work", label: "Work" },
      type: "activity.started",
    },
  ]);
  const elapsed = performance.now() - start;
  if (staged.ok) {
    await staged.value.persisted;
  }
  return elapsed;
};

const median = (values: readonly number[]): number =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? Infinity;

type Reading = { readonly shortMs: number; readonly longMs: number };

/** The median action on each history, the two taken in turn so load from other files hits both. */
const readMedians = async (short: Seeded, long: Seeded, from: number): Promise<Reading> => {
  const shortTimes: number[] = [];
  const longTimes: number[] = [];
  for (let index = from; index < from + ACTIONS; index += 1) {
    shortTimes.push(await actionMs(short, index));
    longTimes.push(await actionMs(long, index));
  }
  return { longMs: median(longTimes), shortMs: median(shortTimes) };
};

describe("an action on a long history (bug-lessons class 55)", () => {
  it("shows in time that grows no faster than the log: 8,000 events at most 5× 2,000, within a frame", async () => {
    const short = await seeded(2000);
    const long = await seeded(8000);
    await readMedians(short, long, 0);
    // Up to three readings, the lowest ratio kept: see materialize-cost.test.ts in core.
    let best: Reading = { longMs: Infinity, shortMs: 1 };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const reading = await readMedians(short, long, attempt * ACTIONS);
      best = reading.longMs / reading.shortMs < best.longMs / best.shortMs ? reading : best;
      if (best.longMs / best.shortMs <= RATIO_MAX && best.longMs <= FRAME_MS) {
        break;
      }
    }
    expect(best.longMs / best.shortMs).toBeLessThanOrEqual(RATIO_MAX);
    expect(best.longMs).toBeLessThanOrEqual(FRAME_MS);
  });
});
