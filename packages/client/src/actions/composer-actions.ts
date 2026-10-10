import { err, instanceBodies, newId, type QuickInput, taskById } from "@pace/core";

import type { ComposerModel } from "../view-models/composer.ts";

import { type ActionDeps, type ActionResult, emit, stamp } from "./deps.ts";
import { type CreateTaskForm, type SubtaskForm, taskActions } from "./task-actions.ts";

/** What the expanded composer adds to the line: a description and problems typed one by one. */
export type ComposerExtras = {
  readonly description?: string | undefined;
  readonly subtasks?: readonly string[] | undefined;
};

export type ComposerActions = {
  /**
  Enter in the composer: a new task from the chips (importance always stored explicitly,
  the typed line kept as its source), or the problems added to this week's homework.
  */
  readonly createFromComposer: (model: ComposerModel, extras?: ComposerExtras) => ActionResult;
};

const subtaskForms = (model: ComposerModel, extras: ComposerExtras): readonly SubtaskForm[] => [
  ...model.subtasks.map((subtask) =>
    subtask.number === null
      ? { label: subtask.label }
      : { label: subtask.label, number: subtask.number },
  ),
  ...(extras.subtasks ?? [])
    .map((label) => label.trim())
    .filter((label) => label !== "")
    .map((label) => ({ label })),
];

/** The composer's reading in the shape the core writes from (the bot and the server use it too). */
const quickInputOf = (
  model: ComposerModel,
  input: { readonly description: null | string; readonly subtasks: readonly SubtaskForm[] },
): QuickInput => ({
  description: input.description,
  dueAt: model.due?.at ?? null,
  dueTz: model.due?.tz ?? null,
  estimateMinutes: model.estimateMinutes,
  importance: model.importance,
  isImportanceExplicit: true,
  link: model.link?.url ?? null,
  presetId: model.preset.id,
  projectId: model.project?.id ?? null,
  projectName: model.newProjectName,
  spans: model.spans,
  subtasks: input.subtasks.map((subtask) => ({
    label: subtask.label,
    number: subtask.number ?? null,
  })),
  text: model.text,
  title: model.title,
});

/** The problems, the details and the text itself added to this week's homework. */
const addToInstance = async (
  deps: ActionDeps,
  model: ComposerModel & {
    readonly target: { readonly kind: "instance"; readonly taskId: string };
  },
  input: { readonly description: null | string; readonly subtasks: readonly SubtaskForm[] },
): ActionResult => {
  const task = taskById(deps.state.store.getState().tasks, model.target.taskId);
  if (task === undefined) {
    return err("action/invalid-input");
  }
  const bodies = instanceBodies(quickInputOf(model, input), task, {
    newId,
    now: deps.clock.now(),
  });
  return await emit(
    deps,
    bodies.map((body) => stamp(deps, body)),
  );
};

const blankToUndefined = (text: string | undefined): string | undefined => {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed;
};

/** The model's dates as a form's: absent when not set. */
const scheduleOf = (
  model: ComposerModel,
): Pick<CreateTaskForm, "dueAt" | "dueTz" | "startAt" | "startTz"> => ({
  ...(model.due !== null && { dueAt: model.due.at, dueTz: model.due.tz }),
  ...(model.start !== null && { startAt: model.start.at, startTz: model.start.tz }),
});

const newTaskForm = (
  model: ComposerModel,
  details: { readonly description: null | string; readonly subtasks: readonly SubtaskForm[] },
): CreateTaskForm => ({
  title: model.title === "" ? model.text.trim() : model.title,
  presetId: model.preset.id,
  projectId: model.project?.id,
  projectName: model.project === null ? (model.newProjectName ?? undefined) : undefined,
  importance: model.importance,
  ...scheduleOf(model),
  estimateMinutes: model.estimateMinutes ?? undefined,
  subtasks: details.subtasks,
  description: details.description ?? undefined,
  sourceText: model.text,
  fields: model.link === null ? {} : { link: model.link.url },
});

export const composerActions = (deps: ActionDeps): ComposerActions => ({
  createFromComposer: async (model, extras = {}) => {
    if (model.isEmpty) {
      return err("action/empty-text");
    }
    const subtasks = subtaskForms(model, extras);
    const description =
      blankToUndefined(extras.description) ??
      blankToUndefined(model.description ?? undefined) ??
      null;
    const details = { description, subtasks };
    return model.target.kind === "instance"
      ? await addToInstance(deps, { ...model, target: model.target }, details)
      : await taskActions(deps).createTask(newTaskForm(model, details));
  },
});
