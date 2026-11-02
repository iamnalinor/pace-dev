import {
  err,
  type Event,
  type EventInput,
  newId,
  ok,
  parseEvent,
  type ActionError as PlannedActionError,
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
import type { PersistError } from "../local-log.ts";
import type { AppStateHandle } from "../state.ts";

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
  "event/duplicate",
  "event/not-found",
  "persist_failed",
  "undo/nothing",
] satisfies readonly ActionError[];

type StoreError = (typeof STORE_ERRORS)[number];

const isStoreError = (code: string): code is StoreError =>
  (STORE_ERRORS as readonly string[]).includes(code);

const storeError = (code: string): ActionError => (isStoreError(code) ? code : `dispatch/${code}`);

/** A single store answer (dispatch, revoke, undo) as an action result. */
export const fromStore = (result: Result<Event, string>): Result<readonly Event[], ActionError> =>
  result.ok ? ok([result.value]) : err(storeError(result.error));

const stageAll = async (deps: ActionDeps, inputs: readonly EventInput[]): Promise<StagedResult> => {
  const staged = await deps.state.stage(inputs);
  return staged.ok ? ok(staged.value) : err(storeError(staged.error));
};

/**
The one path to the log: every input is checked by the core's retro rules against the
current state before any is shown, so a rejected batch leaves no trace; the batch is then
shown at once and written in one go. Answers as soon as the state shows it.
*/
export const stageEmit = async (
  deps: ActionDeps,
  inputs: readonly EventInput[],
): Promise<StagedResult> => {
  const snapshot = deps.state.store.getState();
  const now = deps.clock.now();
  const malformed = inputs
    .map((input) =>
      parseEvent({
        ...input,
        deviceId: input.deviceId ?? "validation",
        id: input.id ?? newId(),
        recordedAt: input.recordedAt ?? now,
      }),
    )
    .find((checked) => !checked.ok);
  if (malformed !== undefined) {
    return err(storeError(malformed.error));
  }
  const rejected = inputs
    .map((input) => validateEventInput(snapshot, input, now))
    .find((checked) => !checked.ok);
  return rejected === undefined ? await stageAll(deps, inputs) : err(rejected.error);
};

/** `stageEmit`, answering once the write landed (`persist_failed` when the store refused it). */
export const emit = async (deps: ActionDeps, inputs: readonly EventInput[]): ActionResult =>
  await settle(await stageEmit(deps, inputs));

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

/** The task's preset chain with its own overrides on top, shaped by its subtasks. */
export const presetOf = (deps: ActionDeps, task: Task): Result<ResolvedPreset, PresetError> =>
  taskPreset(deps.state.store.getState().presets, task);
