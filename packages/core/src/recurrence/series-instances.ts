import type { EventInput } from "../events/event-schema.ts";
import type { Task, TasksState } from "../model/task.ts";
import type { Series, SeriesState } from "./series-reducer.ts";

import { nextSeriesSlot, type SeriesSlot, seriesSlotAt } from "./series.ts";

export type MissingSeriesInput = {
  readonly tasks: TasksState;
  readonly series: SeriesState;
  readonly now: string;
  readonly existingEventIds?: ReadonlySet<string> | undefined;
};

/**
Stable across devices and never confused with the preset homework `hw:` ids. `revisionKey` is
the series' `revisionKey`: an edit undone and made again starts fresh ids, not the old ones.
*/
export const seriesInstanceId = (seriesId: string, revisionKey: string, index: number): string =>
  `rep:${seriesId}:${revisionKey}:${String(index)}`;

/** The revocation of a future instance when its series is archived. */
export const seriesArchiveId = (seriesId: string): string => `rep:${seriesId}:archive`;

/** A future instance revoked or amended for a series revision (`:<n>` on a retry, see `unusedId`). */
export const seriesRevisionId = (
  seriesId: string,
  kind: "amend" | "revoke",
  revisionKey: string,
): string => `rep:${seriesId}:${kind}:${revisionKey}`;

/** More corrections of one instance for one schedule than History undo can make. */
export const MAX_ATTEMPTS = 16;

/**
The first of `base`, `base:1`, `base:2`… not in the log: the same log gives every device the
same id, and a correction undone in History never blocks the next one with its old id. `null`
past `MAX_ATTEMPTS`: a correction the materializer keeps ignoring is not written forever.
*/
const unusedId = (
  base: string,
  known: ReadonlySet<string> | undefined,
  attempt = 0,
): null | string => {
  if (attempt >= MAX_ATTEMPTS) {
    return null;
  }
  const id = attempt === 0 ? base : `${base}:${String(attempt)}`;
  return known?.has(id) === true ? unusedId(base, known, attempt + 1) : id;
};

const tasksOf = (tasks: TasksState, seriesId: string): readonly Task[] =>
  Object.values(tasks.byId).filter((task) => task.seriesId === seriesId);

const latestTime = (tasks: readonly Task[], now: string): string =>
  tasks
    .map((task) => task.startAt)
    .filter((at): at is string => at !== null && at > now)
    .toSorted((a, b) => a.localeCompare(b))
    .at(-1) ?? now;

/**
An instance: the template moved to the slot. The deadline moves by the schedule itself, not
by the days the start moved: a monthly task due Jan 31 is next due Feb 28 (months count from
its own day), whatever the gap between its start and its deadline.
*/
const createPayload = (series: Series, slot: SeriesSlot) => {
  const { template } = series;
  return {
    ...template,
    taskId: seriesInstanceId(series.id, series.revisionKey, slot.index),
    seriesRevision: series.revision,
    startAt: slot.at,
    ...(template.dueAt !== undefined && {
      dueAt: seriesSlotAt(template.dueAt, series.schedule, {
        index: slot.index,
        zone: template.dueTz ?? template.startTz,
      }),
    }),
  };
};

const created = (series: Series, slot: SeriesSlot, now: string): EventInput => ({
  id: seriesInstanceId(series.id, series.revisionKey, slot.index),
  type: "task.created",
  occurredAt: now,
  precision: "exact",
  source: "system",
  payload: createPayload(series, slot),
});

const updated = (
  series: Series,
  task: Task,
  options: { readonly id: string; readonly slot: null | SeriesSlot; readonly now: string },
): EventInput =>
  options.slot === null
    ? {
        id: options.id,
        type: "event.revoked",
        occurredAt: options.now,
        precision: "exact",
        source: "system",
        payload: { targetId: task.createdEventId, reason: "series schedule ended" },
      }
    : {
        id: options.id,
        type: "event.amended",
        occurredAt: options.now,
        precision: "exact",
        source: "system",
        payload: {
          targetId: task.createdEventId,
          patch: { ...createPayload(series, options.slot), taskId: task.id },
        },
      };

const nextNotKnown = (
  series: Series,
  after: string,
  known: ReadonlySet<string> | undefined,
): null | SeriesSlot => {
  const slot = nextSeriesSlot(series.template.startAt, series.schedule, {
    after,
    zone: series.template.startTz,
  });
  if (slot === null) {
    return null;
  }
  return known?.has(seriesInstanceId(series.id, series.revisionKey, slot.index)) === true
    ? nextNotKnown(series, slot.at, known)
    : slot;
};

const archivedEvents = (
  series: Series,
  future: Task | undefined,
  input: MissingSeriesInput,
): readonly EventInput[] => {
  const id = seriesArchiveId(series.id);
  return future === undefined ||
    future.userModified ||
    future.id === series.keepTaskId ||
    input.existingEventIds?.has(id) === true
    ? []
    : [
        {
          id,
          type: "event.revoked",
          occurredAt: input.now,
          precision: "exact",
          source: "system",
          payload: { targetId: future.createdEventId, reason: "series archived" },
        },
      ];
};

const revisedEvents = (
  series: Series,
  future: Task,
  input: MissingSeriesInput,
): readonly EventInput[] => {
  if (future.userModified || future.seriesRevision === series.revision) {
    return [];
  }
  const slot = nextSeriesSlot(series.template.startAt, series.schedule, {
    after: input.now,
    zone: series.template.startTz,
  });
  const id = unusedId(
    seriesRevisionId(series.id, slot === null ? "revoke" : "amend", series.revisionKey),
    input.existingEventIds,
  );
  return id === null ? [] : [updated(series, future, { id, slot, now: input.now })];
};

const missingFor = (series: Series, input: MissingSeriesInput): readonly EventInput[] => {
  const tasks = tasksOf(input.tasks, series.id);
  const future = tasks
    .filter((task) => task.startAt !== null && task.startAt > input.now && task.closed === null)
    .toSorted((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""))[0];
  if (series.archived) {
    return archivedEvents(series, future, input);
  }
  if (future !== undefined) {
    return revisedEvents(series, future, input);
  }
  const slot = nextNotKnown(series, latestTime(tasks, input.now), input.existingEventIds);
  return slot === null ? [] : [created(series, slot, input.now)];
};

/** At most one future independent task per series; deterministic events make retries safe. */
export const missingSeriesEvents = (input: MissingSeriesInput): readonly EventInput[] =>
  Object.values(input.series.byId).flatMap((series) => missingFor(series, input));
