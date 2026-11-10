import {
  err,
  type Event,
  type EventInput,
  ok,
  type ActionError as PlannedActionError,
  type PresetError,
  type PresetValidationError,
  type Result,
  type RetroError,
  type Task,
  taskById,
  validateEventInput,
} from "@pace/core";

import type { Clock } from "../clock.ts";
import type { HistoryError } from "../history-types.ts";
import type { PersistError } from "../local-log.ts";
import type { AppStateHandle } from "../state.ts";

import { requiresSourceForEvent } from "../checkpoint-validation.ts";

/**
Every action answers with the events it appended or one of these codes: the core's own
validation codes pass through untouched, `action/*` are the client's, and a store refusal
keeps its message behind `dispatch/`; a write the local store refused answers `persist_failed`.
*/
/** Why a project name cannot be used: empty, or another active project carries it. */
export type ProjectNameError = "project/name-required" | "project/name-taken";

export type ActionError =
  | "action/empty-text"
  | "action/invalid-input"
  | "action/not-auto-outcome"
  | "action/nothing-to-do"
  | "action/unknown-project"
  | "action/unknown-review-action"
  | "event/duplicate"
  | "event/not-found"
  | "undo/nothing"
  | `dispatch/${string}`
  | HistoryError
  | PersistError
  | PlannedActionError
  | PresetError
  | PresetValidationError
  | ProjectNameError
  | RetroError;

export type ActionResult = Promise<Result<readonly Event[], ActionError>>;

/**
An action's events once the state shows them (the screen answers from here) with their write to
the local store still on its way: `persisted` answers the action, `persist_failed` when refused.
*/
export type StagedResult = Result<
  { readonly events: readonly Event[]; readonly persisted: ActionResult },
  ActionError
>;

/** The action's answer: the refusal as it is, or the outcome of the write. */
const settle = async (staged: StagedResult): ActionResult =>
  staged.ok ? await staged.value.persisted : staged;

export type ActionDeps = {
  readonly state: AppStateHandle;
  readonly clock: Clock;
  readonly source: "app" | "web";
};

/** When something happened: now by default, exact unless the user said "about then". */
export type When = {
  readonly at?: string | undefined;
  readonly precision?: Event["precision"] | undefined;
};

/** Distributive over the event union, so `type` and `payload` stay correlated in the spread. */
export type Body<I = EventInput> = I extends { readonly type: unknown; readonly payload: unknown }
  ? Pick<I, "payload" | "type">
  : never;

/** The client's envelope around a payload: its own source, the user's instant and precision. */
export const stamp = (deps: ActionDeps, body: Body, when: When = {}): EventInput => ({
  ...body,
  occurredAt: when.at ?? deps.clock.now(),
  precision: when.precision ?? "exact",
  source: deps.source,
});

const STORE_ERRORS = [
  "action/nothing-to-do",
  "event/duplicate",
  "event/not-found",
  "persist_failed",
  "undo/nothing",
  "history/not-loaded",
  "history/offline",
  "history/unavailable",
  "history/incomplete",
  "sync/copy-changed",
] satisfies readonly ActionError[];

type StoreError = (typeof STORE_ERRORS)[number];

const isStoreError = (code: string): code is StoreError =>
  (STORE_ERRORS as readonly string[]).includes(code);

const storeError = (code: string): ActionError => (isStoreError(code) ? code : `dispatch/${code}`);

/** A batch the store wrote (several revocations) as an action result. */
export const fromStoreAll = (
  result: Result<readonly Event[], string>,
): Result<readonly Event[], ActionError> => (result.ok ? result : err(storeError(result.error)));

/** A single store answer (dispatch, revoke, undo) as an action result. */
export const fromStore = (result: Result<Event, string>): Result<readonly Event[], ActionError> =>
  result.ok ? ok([result.value]) : err(storeError(result.error));

/** Whether a checkpoint's base cannot take one of the events as it is: the source is needed first. */
const requiresHistory = (deps: ActionDeps, events: readonly Event[]): boolean => {
  const { checkpoint } = deps.state.store.getState();
  return checkpoint !== null && events.some((event) => requiresSourceForEvent(checkpoint, event));
};

/**
The one path to the log: every input is checked by the core's retro rules against the
current state before any is shown, so a rejected batch leaves no trace; the batch is then
shown at once and written in one go. Answers as soon as the state shows it. The envelopes are
made once (`prepare`): the events checked here are the ones staged, ids included. The rules run in
the store's write queue, on the state every earlier write left, so two taps in one tick cannot
both pass them (check, then act; review I4).
*/
export const stageEmit = async (
  deps: ActionDeps,
  inputs: readonly EventInput[],
  /** The action's own check of the state, run in the queue too (`action/nothing-to-do`, class 222). */
  check?: () => ActionError | null,
): Promise<StagedResult> => {
  const prepared = deps.state.prepare(inputs);
  if (!prepared.ok) {
    return err(storeError(prepared.error));
  }
  if (requiresHistory(deps, prepared.value)) {
    const history = await deps.state.ensureHistory();
    if (!history.ok) {
      return history;
    }
  }
  const now = deps.clock.now();
  // What the rules said, kept apart from the store's own refusals (those go behind `dispatch/`).
  const verdict: { rejected: ActionError | null } = { rejected: null };
  const staged = await deps.state.stageEvents(prepared.value, () => {
    const own = check?.() ?? null;
    if (own !== null) {
      verdict.rejected = own;
      return own;
    }
    const snapshot = deps.state.store.getState();
    const refusal = inputs
      .map((input) => validateEventInput(snapshot, input, now))
      .find((checked) => !checked.ok);
    verdict.rejected = refusal?.error ?? null;
    return verdict.rejected;
  });
  return staged.ok ? ok(staged.value) : err(verdict.rejected ?? storeError(staged.error));
};

/** `stageEmit`, answering once the write landed (`persist_failed` when the store refused it). */
export const emit = async (
  deps: ActionDeps,
  inputs: readonly EventInput[],
  check?: () => ActionError | null,
): ActionResult => await settle(await stageEmit(deps, inputs, check));

/** Per client: the last check-then-show still running. */
const queues = new WeakMap<ActionDeps, Promise<unknown>>();

/**
Runs a check-then-show after the previous one is shown, so a double tap cannot pass the same
check twice (two closes of one task). It waits for the state, not for the disk: the next tap's
check reads the state, which already holds the previous action.
*/
export const serially = async (
  deps: ActionDeps,
  run: () => Promise<StagedResult>,
): ActionResult => {
  const previous = queues.get(deps) ?? Promise.resolve();
  const next = (async () => {
    try {
      await previous;
    } catch {
      // The previous action answered its own caller; this one runs regardless.
    }
    return await run();
  })();
  queues.set(deps, next);
  return await settle(await next);
};

export const taskOf = (deps: ActionDeps, taskId: string): Result<Task, "task/unknown"> => {
  const task = taskById(deps.state.store.getState().tasks, taskId);
  return task === undefined ? err("task/unknown") : ok(task);
};

export const withCompleteHistory =
  <A extends readonly unknown[]>(deps: ActionDeps, run: (...args: A) => ActionResult) =>
  async (...args: A): ActionResult => {
    const history = await deps.state.ensureHistory();
    return history.ok ? await run(...args) : history;
  };
