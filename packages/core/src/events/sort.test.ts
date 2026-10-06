import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Event } from "./event-schema.ts";

import { newId } from "../ids.ts";
import { sortEvents } from "./sort.ts";

const reopened = (id: string, occurredAt: string, taskId = "t"): Event => ({
  deviceId: "d",
  id,
  occurredAt,
  payload: { taskId },
  precision: "exact",
  recordedAt: occurredAt,
  source: "app",
  type: "task.reopened",
});

const byId = (x: Event, y: Event): number => x.id.localeCompare(y.id);

describe("sortEvents", () => {
  it("orders by occurredAt, then id, keeping input order for full ties", () => {
    const a = reopened("01ARZ3NDEKTSV4RRFFQ69G5FAB", "2026-10-06T10:00:00.000Z", "first");
    const b = reopened("01ARZ3NDEKTSV4RRFFQ69G5FAA", "2026-10-06T10:00:00.000Z");
    const c = reopened("01ARZ3NDEKTSV4RRFFQ69G5FAC", "2026-10-06T09:00:00.000Z");
    const d = reopened("01ARZ3NDEKTSV4RRFFQ69G5FAB", "2026-10-06T10:00:00.000Z", "second");
    expect(sortEvents([a, b, c, d])).toEqual([c, b, a, d]);
  });

  it("does not mutate its input", () => {
    const input = [
      reopened("01ARZ3NDEKTSV4RRFFQ69G5FAB", "2026-10-06T10:00:00.000Z"),
      reopened("01ARZ3NDEKTSV4RRFFQ69G5FAA", "2026-10-06T09:00:00.000Z"),
    ];
    const copy = [...input];
    sortEvents(input);
    expect(input).toEqual(copy);
  });

  it("is idempotent and a permutation", () => {
    const msArb = fc.integer({ max: 1_800_000_000_000, min: 1_700_000_000_000 });
    const eventArb = fc
      .tuple(msArb, fc.nat())
      .map(([ms, seed]) => reopened(newId(seed), new Date(ms).toISOString()));
    const eventsArb = fc.array(eventArb);
    fc.assert(
      fc.property(eventsArb, (events) => {
        const sorted = sortEvents(events);
        expect(sortEvents(sorted)).toEqual(sorted);
        expect(sorted.toSorted(byId)).toEqual(events.toSorted(byId));
        const isOrdered = sorted.every(
          (item, index) => index === 0 || (sorted[index - 1]?.occurredAt ?? "") <= item.occurredAt,
        );
        expect(isOrdered).toBe(true);
      }),
    );
  });
});
