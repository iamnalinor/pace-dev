import {
  coreReducer,
  type CoreState,
  type Event,
  EVENT_LABEL_KEYS,
  INITIAL_CORE_STATE,
  isCorrection,
  materializeAt,
  type MessageKey,
  presetById,
  presetLabel,
  shownLabel,
  taskById,
} from "@pace/core";

import { type NowViewModel, nowViewModel } from "./now.ts";

/** The client state as history reads it: the materialized slices plus both logs. */
export type HistorySource = CoreState & {
  /** Effective events: corrections applied. */
  readonly events: readonly Event[];
  /** Every event, corrections included. */
  readonly log: readonly Event[];
};

export type HistoryEntry = {
  readonly id: string;
  /**
  Every event the row stands for: its own, or the revocations one Undo wrote together (an Inbox
  Accept undone is one row, not three; QA round 26 R26-10). Undoing the row undoes them all.
  */
  readonly ids: readonly string[];
  readonly type: Event["type"];
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly source: Event["source"];
  readonly taskId: null | string;
  /** What the line names: the task, the activity or the preset, as it is called now. */
  readonly taskTitle: null | string;
  /** Not a correction and not revoked: the undo button applies. */
  readonly revocable: boolean;
  readonly revokedBy: null | string;
  /** What History calls it: the event's type, a closed task by how it ended (QA round 20 L8). */
  readonly labelKey: MessageKey;
};

export type HistoryViewModel = {
  readonly at: string;
  /** The Now board as it was at that instant. */
  readonly board: NowViewModel;
  /** Newest first. */
  readonly events: readonly HistoryEntry[];
};

export type HistoryOptions = {
  readonly atIso: string;
  readonly deviceTz: string;
};

/** The task an event is about: its own, or, for a correction, its target's. */
const taskIdOf = (event: Event, log: readonly Event[]): null | string => {
  if ("taskId" in event.payload) {
    // Activities name a task only when the time was spent on one.
    return event.payload.taskId ?? null;
  }
  if (!isCorrection(event)) {
    return null;
  }
  const target = log.find((candidate) => candidate.id === event.payload.targetId);
  return target !== undefined && "taskId" in target.payload
    ? (target.payload.taskId ?? null)
    : null;
};

/** A preset by its name now (an Undo picks between them, QA round 23 R23-07), else as written. */
const presetTitleOf = (state: HistorySource, event: Event): null | string | undefined => {
  if (!PRESET_EVENTS.has(event.type) || !("id" in event.payload)) {
    return undefined;
  }
  const preset = presetById(state.presets, event.payload.id);
  if (preset !== undefined) {
    return presetLabel(preset, state.settings.language);
  }
  return "name" in event.payload ? (event.payload.name ?? null) : null;
};

const PRESET_EVENTS: ReadonlySet<Event["type"]> = new Set([
  "preset.archived",
  "preset.created",
  "preset.updated",
]);

/** An activity as it is called now, else as the event wrote it. */
const activityTitleOf = (state: HistorySource, event: Event): null | string | undefined => {
  if (!("activityId" in event.payload)) {
    return undefined;
  }
  const activity = state.time.activities[event.payload.activityId];
  const label =
    activity?.label ?? ("label" in event.payload ? (event.payload.label ?? null) : null);
  return label === null
    ? null
    : shownLabel({ id: event.payload.activityId, label }, state.settings.language);
};

/** What the line names: the task, else the activity or the preset (as it is called now). */
const titleOf = (state: HistorySource, event: Event, taskId: null | string): null | string => {
  const current = taskId === null ? undefined : taskById(state.tasks, taskId);
  if (current !== undefined) {
    return current.title;
  }
  // `undefined`: not this kind of event; `null`: this kind, with nothing to name.
  for (const named of [activityTitleOf(state, event), presetTitleOf(state, event)]) {
    if (named !== undefined) {
      return named;
    }
  }
  return event.type === "task.created" ? event.payload.title : loggedTitleOf(state.log, taskId);
};

/** The title an event wrote for `taskId` itself, or `null`. */
const ownTitle = (event: Event, taskId: string): null | string =>
  "taskId" in event.payload &&
  event.payload.taskId === taskId &&
  "title" in event.payload &&
  typeof event.payload.title === "string"
    ? event.payload.title
    : null;

/**
A task that is gone (its creation undone) is named as the log last wrote it, so its other rows
keep their subject (QA round 27 R27-07): by a title its own events carry, or one an amendment of
them wrote (`{targetId, patch}` names no task; review of the QA 27 wave, M6).
*/
const loggedTitleOf = (log: readonly Event[], taskId: null | string): null | string => {
  if (taskId === null) {
    return null;
  }
  const byId = new Map(log.map((event) => [event.id, event]));
  for (const event of log.toReversed()) {
    const own = ownTitle(event, taskId);
    if (own !== null) {
      return own;
    }
    if (event.type !== "event.amended") {
      continue;
    }
    const target = byId.get(event.payload.targetId);
    const title = event.payload.patch["title"];
    if (typeof title === "string" && target !== undefined && ownTitle(target, taskId) !== null) {
      return title;
    }
  }
  return null;
};

/**
A task event about a task the state no longer holds (its creation was undone); an activity spent
on it still stands on its own.
*/
const isOfGoneTask = (state: HistorySource, event: Event, taskId: null | string): boolean =>
  event.type.startsWith("task.") && taskId !== null && taskById(state.tasks, taskId) === undefined;

const newestFirst = (a: Event, b: Event): number => {
  const keyA = `${a.occurredAt}${a.recordedAt}${a.id}`;
  const keyB = `${b.occurredAt}${b.recordedAt}${b.id}`;
  if (keyA === keyB) {
    return 0;
  }
  return keyA > keyB ? -1 : 1;
};

/** A closed task is named by how it ended; every other event by its type. */
const labelKeyOf = (event: Event): MessageKey => {
  if (event.type !== "task.closed") {
    return EVENT_LABEL_KEYS[event.type];
  }
  switch (event.payload.outcome) {
    case "cancelled":
    case "cancelled_missed": {
      return "event.task.cancelled";
    }
    case "skipped": {
      return "event.task.skipped";
    }
    case "done": {
      return "event.task.closed";
    }
  }
};

/** The revocations one action wrote together: one device, one instant written and recorded. */
const isSameBatch = (a: Event, b: Event): boolean =>
  a.type === "event.revoked" &&
  b.type === "event.revoked" &&
  a.deviceId === b.deviceId &&
  a.occurredAt === b.occurredAt &&
  a.recordedAt === b.recordedAt;

type Row = { readonly event: Event; readonly entry: HistoryEntry };

/** Members of one batch as one row, named by the first that names something. */
const rowOf = (members: readonly HistoryEntry[]): HistoryEntry | null => {
  const [first] = members;
  if (first === undefined) {
    return null;
  }
  const named = members.find((member) => member.taskTitle !== null) ?? first;
  return {
    ...first,
    ids: members.map((member) => member.id),
    taskId: named.taskId,
    taskTitle: named.taskTitle,
  };
};

/**
Neighbouring rows of one batch of revocations as one row. A batch partly taken back another way
(one member revoked alone, by an older client or MCP) is two rows: the members still in effect,
whose Undo revokes only them, and the ones revoked already, which say so (review I2).
*/
const groupBatches = (rows: readonly Row[]): readonly HistoryEntry[] => {
  const starts = rows
    .map((row, index) => {
      const previous = rows[index - 1];
      return previous === undefined || !isSameBatch(previous.event, row.event) ? index : -1;
    })
    .filter((index) => index >= 0);
  return starts
    .flatMap((start, position) => {
      const members = rows
        .slice(start, starts[position + 1] ?? rows.length)
        .map((row) => row.entry);
      const inEffect = members.filter((member) => member.revokedBy === null);
      const revoked = members.filter((member) => member.revokedBy !== null);
      const parts = [rowOf(inEffect), rowOf(revoked)];
      return members[0]?.revokedBy === null ? parts : parts.toReversed();
    })
    .filter((entry) => entry !== null);
};

const entries = (state: HistorySource): readonly HistoryEntry[] => {
  const effective = new Set(state.events.map((event) => event.id));
  const rows = state.log.toSorted(newestFirst).map((event) => {
    const taskId = taskIdOf(event, state.log);
    const isEffective = effective.has(event.id);
    const revokedBy = isEffective
      ? null
      : (state.log.findLast(
          (candidate) =>
            candidate.type === "event.revoked" && candidate.payload.targetId === event.id,
        )?.id ?? null);
    const entry: HistoryEntry = {
      id: event.id,
      ids: [event.id],
      type: event.type,
      occurredAt: event.occurredAt,
      recordedAt: event.recordedAt,
      source: event.source,
      taskId,
      taskTitle: titleOf(state, event, taskId),
      // Undoing an edit of a task that is gone changes nothing: no Undo on it (R27-07).
      revocable: !isCorrection(event) && isEffective && !isOfGoneTask(state, event, taskId),
      revokedBy,
      labelKey: labelKeyOf(event),
    };
    return { entry, event };
  });
  return groupBatches(rows);
};

export const historyViewModel = (
  state: HistorySource,
  options: HistoryOptions,
): HistoryViewModel => {
  const board = materializeAt(state.log, options.atIso, {
    reducer: coreReducer,
    initial: INITIAL_CORE_STATE,
  });
  return {
    at: options.atIso,
    board: nowViewModel(board, { now: options.atIso, deviceTz: options.deviceTz }),
    events: entries(state),
  };
};
