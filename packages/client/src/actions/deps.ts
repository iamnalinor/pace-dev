import {
  err,
  type Event,
  type EventInput,
  ok,
  type PresetError,
  type PresetValidationError,
  type ResolvedPreset,
  type Result,
  type RetroError,
  type Task,
  taskById,
  taskPreset,
  validateEventInput,
} from "@pace/core";

import type { Clock } from "../clock.ts";
import type { AppStateHandle } from "../state.ts";

/**
Every action answers with the events it appended or one of these codes: the core's own
validation codes pass through untouched, `action/*` are the client's, and a store refusal
keeps its message behind `dispatch/`.
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
  | PresetError
  | PresetValidationError
  | ProjectNameError
  | RetroError;

export type ActionResult = Promise<Result<readonly Event[], ActionError>>;

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

const STORE_ERRORS = ["event/duplicate", "event/not-found", "undo/nothing"] as const;

type StoreError = (typeof STORE_ERRORS)[number];

const isStoreError = (code: string): code is StoreError =>
  (STORE_ERRORS as readonly string[]).includes(code);

const storeError = (code: string): ActionError => (isStoreError(code) ? code : `dispatch/${code}`);

/** A single store answer (dispatch, revoke, undo) as an action result. */
export const fromStore = (result: Result<Event, string>): Result<readonly Event[], ActionError> =>
  result.ok ? ok([result.value]) : err(storeError(result.error));

const dispatchAll = async (deps: ActionDeps, inputs: readonly EventInput[]): ActionResult => {
  const events: Event[] = [];
  for (const input of inputs) {
    const dispatched = await deps.state.dispatch(input);
    if (!dispatched.ok) {
      return err(storeError(dispatched.error));
    }
    events.push(dispatched.value);
  }
  return ok(events);
};

/**
The one path to the log: every input is checked by the core's retro rules against the
current state before the first one is appended, so a rejected batch leaves no trace.
*/
export const emit = async (deps: ActionDeps, inputs: readonly EventInput[]): ActionResult => {
  const snapshot = deps.state.store.getState();
  const now = deps.clock.now();
  const rejected = inputs
    .map((input) => validateEventInput(snapshot, input, now))
    .find((checked) => !checked.ok);
  return rejected === undefined ? await dispatchAll(deps, inputs) : err(rejected.error);
};

/** Per client: the last check-then-write still running. */
const queues = new WeakMap<ActionDeps, Promise<unknown>>();

/**
Runs a check-then-write after the previous one finished, so a double tap cannot pass the
same check twice before the first write lands (two closes of one task).
*/
export const serially = async <T>(deps: ActionDeps, run: () => Promise<T>): Promise<T> => {
  const previous = queues.get(deps) ?? Promise.resolve();
  const next = (async () => {
    try {
      await previous;
    } catch {
      // The previous write answered its own caller; this one runs regardless.
    }
    return await run();
  })();
  queues.set(deps, next);
  return await next;
};

export const taskOf = (deps: ActionDeps, taskId: string): Result<Task, "task/unknown"> => {
  const task = taskById(deps.state.store.getState().tasks, taskId);
  return task === undefined ? err("task/unknown") : ok(task);
};

/** The task's preset chain with its own overrides on top, shaped by its subtasks. */
export const presetOf = (deps: ActionDeps, task: Task): Result<ResolvedPreset, PresetError> =>
  taskPreset(deps.state.store.getState().presets, task);
