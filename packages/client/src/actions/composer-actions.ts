import { err } from "@pace/core";

import type { ComposerModel } from "../view-models/composer.ts";

import { type ActionDeps, type ActionResult, emit, stamp } from "./deps.ts";
import {
  type CreateTaskForm,
  type SubtaskForm,
  subtaskInputs,
  taskActions,
} from "./task-actions.ts";

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

const addToInstance = async (
  deps: ActionDeps,
  taskId: string,
  input: { readonly model: ComposerModel; readonly subtasks: readonly SubtaskForm[] },
): ActionResult => {
  const { model, subtasks } = input;
  return await emit(deps, [
    ...(subtasks.length === 0
      ? []
      : [
          stamp(deps, {
            type: "task.subtasks.added",
            payload: { taskId, subtasks: subtaskInputs(subtasks) },
          }),
        ]),
    stamp(deps, {
      type: "task.source.attached",
      payload: {
        taskId,
        sourceText: model.text.trim(),
        ...(model.link !== null && { sourceUrl: model.link.url }),
      },
    }),
  ]);
};

const blankToUndefined = (text: string | undefined): string | undefined => {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed;
};

const newTaskForm = (
  model: ComposerModel,
  extras: ComposerExtras,
  subtasks: readonly SubtaskForm[],
): CreateTaskForm => ({
  title: model.title === "" ? model.text.trim() : model.title,
  presetId: model.preset.id,
  projectId: model.project?.id,
  projectName: model.project === null ? (model.newProjectName ?? undefined) : undefined,
  importance: model.importance,
  dueAt: model.due?.at,
  dueTz: model.due?.tz,
  estimateMinutes: model.estimateMinutes ?? undefined,
  subtasks,
  description: blankToUndefined(extras.description),
  sourceText: model.text,
  fields: model.link === null ? {} : { link: model.link.url },
});

export const composerActions = (deps: ActionDeps): ComposerActions => ({
  createFromComposer: async (model, extras = {}) => {
    if (model.isEmpty) {
      return err("action/empty-text");
    }
    const subtasks = subtaskForms(model, extras);
    return model.target.kind === "instance"
      ? await addToInstance(deps, model.target.taskId, { model, subtasks })
      : await taskActions(deps).createTask(newTaskForm(model, extras, subtasks));
  },
});
