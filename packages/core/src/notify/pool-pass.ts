import type { CoreState } from "../materialize/core-state.ts";
import type { Activity } from "../tracking/model.ts";

import { addMinutesIso } from "../time.ts";
import { remindAt } from "../tracking/expect.ts";
import { runningActivity } from "../tracking/timeline.ts";
import { deadlineDigest, digestSlotAt, reportedKey } from "./deadline-digest.ts";
import { longRunCrossing } from "./long-run.ts";
import {
  type ActivityOverrunPayload,
  calendarEventKey,
  type EventStartPayload,
  type NewNotification,
  overrunRef,
  type Resolution,
} from "./pool.ts";
import { isQuietAt, nextDigestAt, quietEndsAt } from "./schedule.ts";

/**
What the server remembers between passes, next to the pool. Not events: nothing here is a user
action; the pool rows say what was sent.
*/
export type PoolMemory = {
  /** The last digest slot handled (sent, empty or too late). */
  readonly digestSlot: null | string;
  /** Tasks already in a digest, as `taskId@dueAt`. */
  readonly reported: readonly string[];
  /** Overruns already asked, as `activityId@askedAt` (the running activity's only). */
  readonly asked: readonly string[];
  /** Calendar occurrences handled (announced, skipped or held back), by `calendarEventKey`. */
  readonly events: readonly string[];
};

export const INITIAL_POOL_MEMORY: PoolMemory = {
  asked: [],
  digestSlot: null,
  events: [],
  reported: [],
};

/** A calendar occurrence as the server's copy has it. */
export type PoolCalendarEvent = {
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly series: null | string;
};

/** An open (unresolved) notification of the pool: what a pass may settle. */
export type OpenNotification = NewNotification & { readonly id: string };

export type PoolInputs = {
  readonly state: CoreState;
  readonly now: string;
  /** The account's zone (the server's fallback before any device reported one). */
  readonly zone: string;
  readonly memory: PoolMemory;
  /** The calendar around `now`. */
  readonly calendar: readonly PoolCalendarEvent[];
  /** Series answered "every time" on the phone: never announced. */
  readonly ruledSeries: readonly string[];
  readonly open: readonly OpenNotification[];
};

export type Settlement = { readonly id: string; readonly resolution: Resolution };

export type PoolPass = {
  readonly created: readonly NewNotification[];
  readonly settled: readonly Settlement[];
  readonly memory: PoolMemory;
  /** When to pass again; `null` when nothing is coming. */
  readonly nextAt: null | string;
};

/** An event is offered this long before its start (Now's offer); tracking from then attends it. */
const OFFER_MINUTES = 10;
/** Handled calendar keys are kept this long after their start. */
const KEEP_EVENT_MINUTES = 2 * 24 * 60;

/** Something under the event's title tracked from its offer on: it was attended. */
export const isEventTracked = (
  event: Pick<PoolCalendarEvent, "endAt" | "startAt" | "title">,
  activities: readonly Pick<Activity, "label" | "startAt">[],
): boolean =>
  activities.some(
    (activity) =>
      activity.label === event.title &&
      activity.startAt >= addMinutesIso(event.startAt, -OFFER_MINUTES) &&
      activity.startAt < event.endAt,
  );

type Inputs = PoolInputs & { readonly activities: readonly Activity[] };

/** The calendar occurrences that could still be announced: not ruled, not handled, not attended. */
const pendingEvents = (inputs: Inputs): readonly PoolCalendarEvent[] => {
  const handled = new Set(inputs.memory.events);
  const ruled = new Set(inputs.ruledSeries);
  return inputs.calendar.filter(
    (event) =>
      event.endAt > inputs.now &&
      !handled.has(calendarEventKey(event)) &&
      (event.series === null || !ruled.has(event.series)) &&
      !isEventTracked(event, inputs.activities),
  );
};

const eventStep = (inputs: Inputs, isQuiet: boolean) => {
  const due = pendingEvents(inputs).filter((event) => event.startAt <= inputs.now);
  return {
    created: isQuiet
      ? []
      : due.map(
          (event): NewNotification => ({
            kind: "event_start",
            payload: {
              end: event.endAt,
              eventKey: calendarEventKey(event),
              start: event.startAt,
              title: event.title,
            },
          }),
        ),
    // Held back by the quiet hours counts as handled: an event is news only as it starts.
    handled: due.map((event) => calendarEventKey(event)),
  };
};

const digestStep = (inputs: Inputs) => {
  const window = digestSlotAt(inputs.now, inputs.zone, inputs.state.settings);
  const isDue =
    window !== null &&
    (inputs.memory.digestSlot === null || window.slot > inputs.memory.digestSlot);
  if (!isDue) {
    return { created: [], reported: [], slot: inputs.memory.digestSlot };
  }
  const tasks = deadlineDigest(inputs.state, {
    nextSlot: window.next,
    reported: inputs.memory.reported,
    slot: window.slot,
  });
  return {
    created:
      tasks.length === 0
        ? []
        : [
            {
              kind: "deadline_digest",
              payload: { slot: window.slot, tasks: [...tasks] },
            } satisfies NewNotification,
          ],
    reported: tasks.map((task) => reportedKey(task.taskId, task.dueAt)),
    slot: window.slot,
  };
};

const overrunStep = (inputs: Inputs, isQuiet: boolean) => {
  const crossing = longRunCrossing(inputs.state.time, inputs.now);
  if (crossing === null) {
    return { asked: [], created: [], waiting: null };
  }
  const ask = { activityId: crossing.activityId, askedAt: crossing.crossedAt };
  const ref = overrunRef(ask);
  const asked = inputs.memory.asked.filter((key) => key.startsWith(`${crossing.activityId}@`));
  if (asked.includes(ref)) {
    return { asked, created: [], waiting: null };
  }
  if (crossing.crossedAt > inputs.now) {
    return { asked, created: [], waiting: crossing.crossedAt };
  }
  if (isQuiet) {
    return {
      asked,
      created: [],
      waiting: quietEndsAt(inputs.now, inputs.zone, inputs.state.settings),
    };
  }
  const created: NewNotification = {
    kind: "activity_overrun",
    payload: {
      ...ask,
      expectMinutes: crossing.expectMinutes,
      label: crossing.label,
      startAt: crossing.startAt,
    },
  };
  return { asked: [...asked, ref], created: [created], waiting: null };
};

/** An event's announcement settles once the event is attended (anywhere) or over. */
const eventSettlement = (payload: EventStartPayload, inputs: Inputs): null | Resolution => {
  const event = { endAt: payload.end, startAt: payload.start, title: payload.title };
  if (isEventTracked(event, inputs.activities)) {
    return "attended";
  }
  return inputs.now >= event.endAt ? "expired" : null;
};

/** An overrun settles once its activity stopped, or once a "yes" or a new Expect moved it on. */
const overrunSettlement = (payload: ActivityOverrunPayload, inputs: Inputs): null | Resolution => {
  const running = runningActivity(inputs.state.time, inputs.now) ?? undefined;
  if (running?.id !== payload.activityId) {
    return "stopped";
  }
  const next = remindAt(running);
  return next !== null && next > payload.askedAt ? "still" : null;
};

/** How an open notification settles on its own; sign-ins and digests wait to be read. */
const settlementOf = (open: OpenNotification, inputs: Inputs): null | Resolution => {
  switch (open.kind) {
    case "event_start": {
      return eventSettlement(open.payload, inputs);
    }
    case "activity_overrun": {
      return overrunSettlement(open.payload, inputs);
    }
    case "login":
    case "deadline_digest": {
      return null;
    }
  }
};

const earliest = (candidates: readonly (null | string | undefined)[], now: string): null | string =>
  candidates
    .filter((at): at is string => at !== null && at !== undefined && at > now)
    .toSorted((a, b) => a.localeCompare(b))
    .at(0) ?? null;

/**
One pass over the pool at `now`, the one place that decides what is due: the deadline digest at
its slot, an event as it starts, "still doing X?" at the running activity's reminder (the last
two held back during the quiet hours; sign-ins and digests never are), and which open
notifications settled on their own. Answers the next instant worth a pass.
*/
export const poolPass = (inputs: PoolInputs): PoolPass => {
  const full: Inputs = { ...inputs, activities: Object.values(inputs.state.time.activities) };
  const { memory, now, zone } = inputs;
  const isQuiet = isQuietAt(now, zone, inputs.state.settings);
  const digest = digestStep(full);
  const events = eventStep(full, isQuiet);
  const overrun = overrunStep(full, isQuiet);
  const settled = inputs.open
    .map((open) => ({ id: open.id, resolution: settlementOf(open, full) }))
    .filter((entry): entry is Settlement => entry.resolution !== null);
  const next: PoolMemory = {
    asked: overrun.asked,
    digestSlot: digest.slot,
    events: [...memory.events, ...events.handled].filter(
      (key) => key.slice(0, key.indexOf("@")) > addMinutesIso(now, -KEEP_EVENT_MINUTES),
    ),
    // Only tasks still open at the deadline reported matter.
    reported: [...memory.reported, ...digest.reported].filter((key) => {
      const [taskId = "", dueAt = ""] = key.split("@", 2);
      return inputs.state.tasks.byId[taskId]?.dueAt === dueAt;
    }),
  };
  const stillOpen = inputs.open.filter((open) => settled.every((done) => done.id !== open.id));
  const nextAt = earliest(
    [
      nextDigestAt(now, zone, inputs.state.settings),
      ...pendingEvents({ ...full, memory: next }).map((event) => event.startAt),
      ...stillOpen.map((open) => (open.kind === "event_start" ? open.payload.end : null)),
      overrun.waiting,
    ],
    now,
  );
  return {
    created: [...digest.created, ...events.created, ...overrun.created],
    memory: next,
    nextAt,
    settled,
  };
};
