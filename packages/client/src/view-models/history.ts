import {
  coreReducer,
  type CoreState,
  type Event,
  INITIAL_CORE_STATE,
  isCorrection,
  materializeAt,
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
  readonly type: Event["type"];
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly source: Event["source"];
  readonly taskId: null | string;
  readonly taskTitle: null | string;
  /** Not a correction and not revoked: the undo button applies. */
  readonly revocable: boolean;
  readonly revokedBy: null | string;
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

const titleOf = (state: HistorySource, event: Event, taskId: null | string): null | string => {
  const current = taskId === null ? undefined : taskById(state.tasks, taskId);
  if (current !== undefined) {
    return current.title;
  }
  return event.type === "task.created" ? event.payload.title : null;
};

const newestFirst = (a: Event, b: Event): number => {
  const keyA = `${a.occurredAt}${a.recordedAt}${a.id}`;
  const keyB = `${b.occurredAt}${b.recordedAt}${b.id}`;
  if (keyA === keyB) {
    return 0;
  }
  return keyA > keyB ? -1 : 1;
};

const entries = (state: HistorySource): readonly HistoryEntry[] => {
  const effective = new Set(state.events.map((event) => event.id));
  return state.log.toSorted(newestFirst).map((event) => {
    const taskId = taskIdOf(event, state.log);
    const isEffective = effective.has(event.id);
    const revokedBy = isEffective
      ? null
      : (state.log.findLast(
          (candidate) =>
            candidate.type === "event.revoked" && candidate.payload.targetId === event.id,
        )?.id ?? null);
    return {
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      recordedAt: event.recordedAt,
      source: event.source,
      taskId,
      taskTitle: titleOf(state, event, taskId),
      revocable: !isCorrection(event) && isEffective,
      revokedBy,
    };
  });
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
