import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";

import { newId } from "../ids.ts";
import {
  apply,
  effectiveEvents,
  materialize,
  materializeAt,
  type Reducer,
  shouldRematerialize,
} from "./materializer.ts";

const at = (hour: number): string => `2026-10-06T${String(hour).padStart(2, "0")}:00:00.000Z`;

const base = (id: string, occurredAt: string) => ({
  deviceId: "d",
  id,
  occurredAt,
  precision: "exact" as const,
  recordedAt: occurredAt,
  source: "app" as const,
});

const created = (id: string, occurredAt: string, title: string): Event => ({
  ...base(id, occurredAt),
  payload: { fields: {}, presetId: "p", subtasks: [], taskId: id, title },
  type: "task.created",
});

const closed = (id: string, occurredAt: string, taskId: string): Event => ({
  ...base(id, occurredAt),
  payload: { outcome: "done", taskId },
  type: "task.closed",
});

const revoke = (id: string, occurredAt: string, targetId: string): Event => ({
  ...base(id, occurredAt),
  payload: { targetId },
  type: "event.revoked",
});

const amend = (
  id: string,
  occurredAt: string,
  target: { readonly targetId: string; readonly patch: Readonly<Record<string, unknown>> },
): Event => ({
  ...base(id, occurredAt),
  payload: target,
  type: "event.amended",
});

type Titles = Readonly<Record<string, string>>;

/** Keeps the titles of open tasks: enough to observe order, patches and revocations. */
const titles: Reducer<Titles> = (state, event) => {
  if (event.type === "task.created") {
    return { ...state, [event.payload.taskId]: event.payload.title };
  }
  if (event.type === "task.closed") {
    const { [event.payload.taskId]: _closed, ...rest } = state;
    return rest;
  }
  return state;
};

const msArb = fc.integer({ max: 1_800_000_000_000, min: 1_700_000_000_000 });
const stampsArb = (minLength: number): fc.Arbitrary<readonly Event[]> =>
  fc
    .uniqueArray(msArb, { maxLength: 40, minLength })
    .map((stamps) => stamps.map((ms) => created(newId(ms), new Date(ms).toISOString(), "t")));

const log: Reducer<readonly string[]> = (state, event) => [...state, event.id];

const A = "01ARZ3NDEKTSV4RRFFQ69G5FAA";
const B = "01ARZ3NDEKTSV4RRFFQ69G5FAB";
const C = "01ARZ3NDEKTSV4RRFFQ69G5FAC";
const D = "01ARZ3NDEKTSV4RRFFQ69G5FAD";
const E = "01ARZ3NDEKTSV4RRFFQ69G5FAE";

describe("effectiveEvents", () => {
  it("drops corrections and revoked targets", () => {
    const events = [created(A, at(1), "a"), created(B, at(2), "b"), revoke(C, at(3), B)];
    expect(effectiveEvents(events)).toEqual([events[0]]);
  });

  it("shallow-merges amendment patches into the target payload", () => {
    const events = [
      created(A, at(1), "a"),
      amend(B, at(2), { patch: { title: "renamed" }, targetId: A }),
    ];
    const [result] = effectiveEvents(events);
    expect(result?.type).toBe("task.created");
    expect(result?.payload).toEqual({ ...events[0]?.payload, title: "renamed" });
  });

  it("applies amendments in occurredAt order whatever the input order", () => {
    const events = [
      amend(C, at(3), { patch: { title: "third" }, targetId: A }),
      created(A, at(1), "a"),
      amend(B, at(2), { patch: { title: "second" }, targetId: A }),
    ];
    expect(effectiveEvents(events)[0]?.payload).toMatchObject({ title: "third" });
  });

  it("applies a correction even when it occurred before its target", () => {
    const events = [created(B, at(5), "b"), revoke(A, at(1), B)];
    expect(effectiveEvents(events)).toEqual([]);
  });

  it("lets an amendment be revoked", () => {
    const events = [
      created(A, at(1), "a"),
      amend(B, at(2), { patch: { title: "renamed" }, targetId: A }),
      revoke(C, at(3), B),
    ];
    expect(effectiveEvents(events)[0]?.payload).toMatchObject({ title: "a" });
  });

  it("lets a revocation be revoked", () => {
    const events = [created(A, at(1), "a"), revoke(B, at(2), A), revoke(C, at(3), B)];
    expect(effectiveEvents(events)).toHaveLength(1);
  });

  it("ignores unknown targets and invalid patches", () => {
    const events = [
      created(A, at(1), "a"),
      revoke(B, at(2), "nope"),
      amend(C, at(3), { patch: { title: "x" }, targetId: "nope" }),
      amend(D, at(4), { patch: { title: 42 }, targetId: A }),
    ];
    expect(effectiveEvents(events)).toEqual([events[0]]);
  });
});

describe("materialize", () => {
  it("folds the effective events in order", () => {
    const events = [closed(C, at(3), A), created(A, at(1), "a"), created(B, at(2), "b")];
    expect(materialize(events, titles, {})).toEqual({ [B]: "b" });
  });

  it("is order-insensitive for distinct occurredAt", () => {
    const shuffledArb = stampsArb(0).chain((events) =>
      fc.tuple(fc.constant(events), fc.shuffledSubarray([...events], { minLength: events.length })),
    );
    fc.assert(
      fc.property(shuffledArb, ([events, shuffled]) => {
        expect(materialize(shuffled, log, [])).toEqual(materialize(events, log, []));
      }),
    );
  });

  it("revoking an event restores the previous state", () => {
    const pickArb = stampsArb(1).chain((events) =>
      fc.tuple(fc.constant(events), fc.constantFrom(...events)),
    );
    fc.assert(
      fc.property(pickArb, ([events, target]) => {
        const before = materialize(events, titles, {});
        const extra = created(E, at(12), "extra");
        const revoked = [...events, extra, revoke(D, at(13), extra.id)];
        expect(materialize(revoked, titles, {})).toEqual(before);
        const { [target.id]: _gone, ...rest } = before;
        const withoutTarget = [...events, revoke(D, at(13), target.id)];
        expect(materialize(withoutTarget, titles, {})).toEqual(rest);
      }),
    );
  });

  it("materializes 20k events under 200 ms with a trivial reducer", () => {
    const stamps = Array.from({ length: 20_000 }, (_, index) => 1_700_000_000_000 + index);
    const events = stamps.map((ms) => created(newId(ms), new Date(ms).toISOString(), "t"));
    const reversed = events.toReversed();
    const start = performance.now();
    const count = materialize(reversed, (state: number) => state + 1, 0);
    expect(performance.now() - start).toBeLessThan(200);
    expect(count).toBe(20_000);
  });
});

describe("materializeAt", () => {
  it("includes only events up to the instant but still applies later corrections", () => {
    const events = [
      created(A, at(1), "a"),
      created(B, at(2), "b"),
      amend(C, at(9), { patch: { title: "renamed" }, targetId: A }),
      revoke(D, at(9), B),
      created(E, at(5), "e"),
    ];
    expect(materializeAt(events, at(3), { initial: {}, reducer: titles })).toEqual({
      [A]: "renamed",
    });
  });
});

describe("apply", () => {
  const createdA = created(A, at(1), "a");
  const revokedA = revoke(B, at(2), A);

  it("applies one in-order event", () => {
    expect(apply({}, createdA, titles)).toEqual({ [A]: "a" });
  });

  it("ignores corrections (they require a re-materialize)", () => {
    const state = { [A]: "a" };
    expect(apply(state, revokedA, titles)).toBe(state);
  });
});

describe("shouldRematerialize", () => {
  const createdAt2 = created(A, at(2), "a");
  const revokedA = revoke(B, at(2), A);
  const amendedA = amend(B, at(2), { patch: {}, targetId: A });

  it("is false for an in-order event", () => {
    expect(shouldRematerialize(at(1), createdAt2)).toBe(false);
    expect(shouldRematerialize(null, createdAt2)).toBe(false);
  });

  it("is true for a retroactive event", () => {
    expect(shouldRematerialize(at(3), createdAt2)).toBe(true);
  });

  it("is true for any correction", () => {
    expect(shouldRematerialize(at(1), revokedA)).toBe(true);
    expect(shouldRematerialize(null, amendedA)).toBe(true);
  });
});
