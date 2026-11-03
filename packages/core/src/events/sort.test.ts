import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Event } from "./event-schema.ts";

import { newId } from "../ids.ts";
import { compareEvents, mergeEvents, mergeSorted, sortEvents } from "./sort.ts";

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
    // The id is made at the event's own time: a random number is no time for a ULID.
    const eventArb = msArb.map((ms) => reopened(newId(ms), new Date(ms).toISOString()));
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

/** An event at one of a few instants with one of a few ids: ties (full ones too) are common. */
const tiedArb = fc
  .tuple(fc.integer({ max: 3, min: 0 }), fc.integer({ max: 3, min: 0 }), fc.nat())
  .map(([minute, idIndex, marker]) =>
    reopened(
      `01ARZ3NDEKTSV4RRFFQ69G5FA${"ABCD"[idIndex] ?? "A"}`,
      `2026-10-06T10:0${minute}:00.000Z`,
      `task-${marker}`,
    ),
  );

describe("mergeEvents", () => {
  it("equals sorting the whole of both, element for element, ties in the same order", () => {
    fc.assert(
      fc.property(fc.array(tiedArb), fc.array(tiedArb), (base, fresh) => {
        const sorted = sortEvents(base);
        const merged = mergeEvents(sorted, fresh);
        const expected = sortEvents([...sorted, ...fresh]);
        expect(merged).toHaveLength(expected.length);
        expect(merged.every((event, index) => event === expected[index])).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("leaves both inputs as they were", () => {
    const sorted = sortEvents([
      reopened("01ARZ3NDEKTSV4RRFFQ69G5FAA", "2026-10-06T09:00:00.000Z"),
      reopened("01ARZ3NDEKTSV4RRFFQ69G5FAC", "2026-10-06T11:00:00.000Z"),
    ]);
    const fresh = [reopened("01ARZ3NDEKTSV4RRFFQ69G5FAB", "2026-10-06T10:00:00.000Z")];
    const [first, second] = sorted;
    mergeEvents(sorted, fresh);
    expect(sorted).toEqual([first, second]);
    expect(fresh).toHaveLength(1);
  });

  it("appending to a long log compares a few times, not once per event in it (class 55)", () => {
    const long = Array.from({ length: 8000 }, (_, index) =>
      reopened(newId(1_700_000_000_000 + index), new Date(1_700_000_000_000 + index).toISOString()),
    );
    const late = reopened(newId(1_800_000_000_000), new Date(1_800_000_000_000).toISOString());
    let compares = 0;
    const counted = (a: Event, b: Event): number => {
      compares += 1;
      return compareEvents(a, b);
    };
    const merged = mergeSorted(long, [late], counted);
    expect(merged.at(-1)).toBe(late);
    expect(compares).toBeLessThanOrEqual(20);
  });
});
