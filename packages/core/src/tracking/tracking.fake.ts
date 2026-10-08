import type { Event, EventInput } from "../events/event-schema.ts";
import type { TimeState } from "./model.ts";

import { materialize } from "../materialize/materializer.ts";
import { event } from "../materialize/task-fixture.fake.ts";
import { INITIAL_TIME_STATE } from "./model.ts";
import { timeReducer } from "./time-reducer.ts";

type Body<I = EventInput> = I extends { readonly type: unknown; readonly payload: unknown }
  ? Pick<I, "payload" | "type">
  : never;

/** Wednesday October 7 2026 in UTC, minute by minute. */
export const T = (hhmm: string): string => `2026-10-07T${hhmm}:00.000Z`;

const counter = { next: 100 };

/** An activity event at `hhmm`, numbered so the log keeps its order. */
export const act = (hhmm: string, body: Body): Event => {
  counter.next += 1;
  return event(counter.next, { occurredAt: T(hhmm), precision: "exact", source: "app", ...body });
};

export const start = (
  hhmm: string,
  activityId: string,
  label: string,
  extra: Partial<Extract<Body, { type: "activity.started" }>["payload"]> = {},
): Event =>
  act(hhmm, {
    payload: { activityId, category: "work", label, ...extra },
    type: "activity.started",
  });

export const timeOf = (events: readonly Event[]): TimeState =>
  materialize(events, timeReducer, INITIAL_TIME_STATE);
