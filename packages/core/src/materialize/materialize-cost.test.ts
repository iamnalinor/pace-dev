import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";

import { ACTIVITY_CATEGORIES } from "../events/payloads.ts";
import { sortEvents } from "../events/sort.ts";
import { coreReducer, type CoreState, INITIAL_CORE_STATE } from "./core-state.ts";
import { effectiveEvents, materialize, materializeAt } from "./materializer.ts";
import { yearOfUse } from "./year-of-use.fake.ts";

/**
The same reducers folded one event at a time, the way the client integrates a local action: every
step copies what it changes, so this is the reducers' plain (old) semantics, the oracle of the
batch that `materialize` runs.
*/
const oneByOne = (events: readonly Event[]): CoreState => {
  const ordered = sortEvents(effectiveEvents(events));
  let state = INITIAL_CORE_STATE;
  for (const event of ordered) {
    state = coreReducer(state, event);
  }
  return state;
};

/** The fastest of a few rebuilds (after a warm-up): the least noisy reading of what one costs. */
const rebuildMs = (events: readonly Event[]): number => {
  materialize(events, coreReducer, INITIAL_CORE_STATE);
  let best = Infinity;
  for (let run = 0; run < 5; run += 1) {
    const start = performance.now();
    materialize(events, coreReducer, INITIAL_CORE_STATE);
    best = Math.min(best, performance.now() - start);
  }
  return best;
};

describe("materialize: cost over a year of history (bug-lessons class 55)", () => {
  it("rebuilds in time linear in the log: 8,000 events cost at most 5× 2,000, within 300 ms", () => {
    const short = yearOfUse(2000, 7);
    const long = yearOfUse(8000, 7);
    const shortMs = rebuildMs(short);
    const longMs = rebuildMs(long);
    expect(longMs / shortMs).toBeLessThanOrEqual(5);
    expect(longMs).toBeLessThanOrEqual(300);
  });
});

const MINUTE = 60_000;
const BASE_MS = Date.parse("2026-10-05T06:00:00.000Z");
const ids = ["a", "b", "c", "d"] as const;
const tasks = ["t1", "t2"] as const;

/** Few ids and a short span, so starts, stops and edits collide on the same activities and instants. */
const tangledEventArb: fc.Arbitrary<Omit<Event, "id">> = fc
  .tuple(
    fc.integer({ max: 120, min: 0 }),
    fc.constantFrom(...ids),
    fc.constantFrom(...tasks),
    fc.integer({ max: 9, min: 0 }),
    fc.integer({ max: 120, min: 1 }),
    fc.boolean(),
  )
  .map(([minute, activityId, taskId, kind, span, flag]) => {
    const occurredAt = new Date(BASE_MS + minute * MINUTE).toISOString();
    const shifted = new Date(BASE_MS + (minute + span - 60) * MINUTE).toISOString();
    const envelope = {
      deviceId: "d",
      occurredAt,
      precision: "exact" as const,
      recordedAt: occurredAt,
      source: "app" as const,
    };
    const category = ACTIVITY_CATEGORIES[minute % ACTIVITY_CATEGORIES.length] ?? "work";
    const bodies: readonly Omit<Event, "id" | keyof typeof envelope>[] = [
      {
        payload: { activityId, category, label: "Work", ...(flag && { alongside: true as const }) },
        type: "activity.started",
      },
      { payload: { activityId }, type: "activity.stopped" },
      {
        payload: {
          activityId,
          category,
          endAt: new Date(BASE_MS + (minute + span) * MINUTE).toISOString(),
          label: "Logged",
          startAt: occurredAt,
        },
        type: "activity.logged",
      },
      {
        payload: flag ? { activityId, startAt: shifted } : { activityId, endAt: shifted },
        type: "activity.adjusted",
      },
      {
        payload: { activityId, label: "Renamed", ...(flag && { taskId }) },
        type: "activity.labelled",
      },
      {
        payload: {
          fields: {},
          presetId: "inbox",
          subtasks: [{ id: "s1", label: "One" }],
          taskId,
          title: "Task",
        },
        type: "task.created",
      },
      { payload: { subtaskId: "s1", taskId }, type: "task.subtask.solved" },
      { payload: { outcome: "done", taskId }, type: "task.closed" },
      { payload: { projectId: `p${span % 3}`, name: "Project" }, type: "project.created" },
      { payload: { taskId }, type: "task.reopened" },
    ];
    return { ...envelope, ...bodies[kind] } as Omit<Event, "id">;
  });

type Draft = readonly [draft: Omit<Event, "id">, correction: number, target: number];

/** A draft as the next event of `log`: as drafted, or a correction of an earlier event. */
const nextEvent = (log: readonly Event[], [draft, correction, target]: Draft): Event => {
  const id = `01ARZ3NDEKTSV4RRFFQ69G5${String(log.length).padStart(3, "0")}`;
  const prior = log[target % Math.max(log.length, 1)];
  if (prior !== undefined && correction === 0) {
    return { ...draft, id, payload: { targetId: prior.id }, type: "event.revoked" };
  }
  if (prior !== undefined && correction === 1) {
    const patch = { label: "Amended", startAt: draft.occurredAt, title: "Amended" };
    return { ...draft, id, payload: { patch, targetId: prior.id }, type: "event.amended" };
  }
  return { ...draft, id } as Event;
};

/** ULIDs in log order (`…000`, `…001`), with corrections that may target any earlier event. */
const tangledLogArb: fc.Arbitrary<readonly Event[]> = fc
  .array(fc.tuple(tangledEventArb, fc.integer({ max: 9, min: 0 }), fc.nat()), { maxLength: 60 })
  .map((drafts) => {
    const log: Event[] = [];
    for (const draft of drafts) {
      log.push(nextEvent(log, draft));
    }
    return log;
  });

describe("materialize: the batch equals the reducers folded one event at a time", () => {
  it("on tangled logs (few ids, colliding instants, corrections of anything)", () => {
    fc.assert(
      fc.property(tangledLogArb, (log) => {
        expect(materialize(log, coreReducer, INITIAL_CORE_STATE)).toEqual(oneByOne(log));
      }),
      { numRuns: 400 },
    );
  });

  it("on years of use of any length and seed", () => {
    fc.assert(
      fc.property(fc.integer({ max: 600, min: 0 }), fc.nat(), (count, seed) => {
        const log = yearOfUse(count, seed);
        expect(materialize(log, coreReducer, INITIAL_CORE_STATE)).toEqual(oneByOne(log));
      }),
      { numRuns: 60 },
    );
  });

  it("as of any instant, every correction still applying", () => {
    fc.assert(
      fc.property(tangledLogArb, fc.integer({ max: 120, min: 0 }), (log, minute) => {
        const atIso = new Date(BASE_MS + minute * MINUTE).toISOString();
        const asOf = materializeAt(log, atIso, {
          initial: INITIAL_CORE_STATE,
          reducer: coreReducer,
        });
        const effectiveByThen = effectiveEvents(log).filter((event) => event.occurredAt <= atIso);
        expect(asOf).toEqual(oneByOne(effectiveByThen));
      }),
      { numRuns: 200 },
    );
  });
});

describe("materialize: what it answers stays the caller's, immutable", () => {
  it("never changes the initial state it starts from (the shared INITIAL constants included)", () => {
    const before = structuredClone(INITIAL_CORE_STATE);
    const halfway = materialize(yearOfUse(300, 3), coreReducer, INITIAL_CORE_STATE);
    const halfwayCopy = structuredClone(halfway);
    materialize(yearOfUse(600, 4), coreReducer, halfway);
    expect(INITIAL_CORE_STATE).toEqual(before);
    expect(halfway).toEqual(halfwayCopy);
  });

  it("an event integrated afterwards makes a new state and leaves the rebuilt one as it was", () => {
    fc.assert(
      fc.property(tangledLogArb, tangledEventArb, (log, draft) => {
        const rebuilt = materialize(log, coreReducer, INITIAL_CORE_STATE);
        const copy = structuredClone(rebuilt);
        // In order after the whole log, as the incremental path requires.
        const later = new Date(BASE_MS + 200 * MINUTE).toISOString();
        const fresh = {
          ...draft,
          id: "01ARZ3NDEKTSV4RRFFQ69G5ZZZ",
          occurredAt: later,
          recordedAt: later,
        } as Event;
        const next = coreReducer(rebuilt, fresh);
        expect(rebuilt).toEqual(copy);
        expect(next).toEqual(oneByOne([...log, fresh]));
      }),
      { numRuns: 200 },
    );
  });

  it("answers maps nobody can write to", () => {
    const state = materialize(yearOfUse(2000, 5), coreReducer, INITIAL_CORE_STATE);
    const maps = [state.time.activities, state.tasks.byId, state.projects.byId, state.series.byId];
    expect(maps.every((map) => Object.isFrozen(map))).toBe(true);
  });
});
