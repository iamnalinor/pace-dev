import type { ActionError } from "@pace/client";
import type { MessageKey, MessageParams } from "@pace/core";

type Translate = (key: MessageKey, params?: MessageParams) => string;

/** Every code an action can answer with, except the open-ended store refusals (`dispatch/…`). */
type KnownError = Exclude<ActionError, `dispatch/${string}`>;

/** One line per code: the record type keeps the list exhaustive when a code is added. */
const KEYS: Readonly<Record<KnownError, MessageKey>> = {
  "action/empty-text": "actionError.action/empty-text",
  "action/invalid-input": "actionError.action/invalid-input",
  "action/not-auto-outcome": "actionError.action/not-auto-outcome",
  "action/nothing-to-do": "actionError.action/nothing-to-do",
  "action/unknown-project": "actionError.action/unknown-project",
  "action/unknown-review-action": "actionError.action/unknown-review-action",
  "event/duplicate": "actionError.event/duplicate",
  "event/not-found": "actionError.event/not-found",
  "preset/bad-id": "actionError.preset/bad-id",
  "preset/built-in": "actionError.preset/built-in",
  "preset/cycle": "actionError.preset/cycle",
  "preset/exists": "actionError.preset/exists",
  "preset/invalid-definition": "actionError.preset/invalid-definition",
  "preset/invalid-overrides": "actionError.preset/invalid-overrides",
  "preset/no-base": "actionError.preset/no-base",
  "preset/self-extends": "actionError.preset/self-extends",
  "preset/unknown": "actionError.preset/unknown",
  "preset/unknown-parent": "actionError.preset/unknown-parent",
  "retro/before-created": "actionError.retro/before-created",
  "retro/future": "actionError.retro/future",
  "retro/nothing-to-submit": "actionError.retro/nothing-to-submit",
  "retro/task-closed": "actionError.retro/task-closed",
  "subtask/unknown": "actionError.subtask/unknown",
  "task/unknown": "actionError.task/unknown",
  "undo/nothing": "actionError.undo/nothing",
};

const isKnown = (code: ActionError): code is KnownError => Object.hasOwn(KEYS, code);

/** The sentence a toast shows for an action's error code. */
export const actionErrorText = (t: Translate, code: ActionError): string =>
  isKnown(code) ? t(KEYS[code]) : t("actionError.generic", { code });
