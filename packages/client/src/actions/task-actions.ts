import { err, type Importance, newId, type Result } from "@pace/core";

import { type ActionDeps, type ActionResult, emit, stamp, type When } from "./deps.ts";
import { type ProjectTarget, type ResolvedProject, resolveProject } from "./projects.ts";

export type SubtaskForm = {
  readonly label: string;
  readonly number?: number | undefined;
};

export type TaskFieldsForm = {
  readonly ticket?: string | undefined;
  readonly submitVia?: string | undefined;
};

/** Instants the user schedules; a missing zone means "the one this device is in". */
type ScheduleForm = {
  readonly dueAt?: string | undefined;
  readonly dueTz?: string | undefined;
  readonly startAt?: string | undefined;
  readonly startTz?: string | undefined;
};

export type CreateTaskForm = ScheduleForm &
  When & {
    readonly title: string;
    readonly presetId: string;
    readonly projectId?: string | undefined;
    /** Creates the project on the fly when no project carries this name yet. */
    readonly projectName?: string | undefined;
    readonly importance?: Importance | undefined;
    readonly estimateMinutes?: number | undefined;
    readonly subtasks?: readonly SubtaskForm[] | undefined;
    readonly description?: string | undefined;
    readonly sourceText?: string | undefined;
    readonly fields?: TaskFieldsForm | undefined;
  };

export type TaskPatch = ScheduleForm & {
  readonly title?: string | undefined;
  /** `null` clears the description. */
  readonly description?: null | string | undefined;
  readonly fields?: TaskFieldsForm | undefined;
};

export type TaskActions = {
  readonly createTask: (form: CreateTaskForm) => ActionResult;
  readonly updateTask: (taskId: string, patch: TaskPatch) => ActionResult;
  /** `null` takes the task out of its project. */
  readonly setProject: (taskId: string, target: null | ProjectTarget) => ActionResult;
};

type SubtaskInput = { readonly id: string; readonly label: string; readonly number?: number };

/** Mutable on purpose: the zod payload type is. */
export const subtaskInputs = (items: readonly (string | SubtaskForm)[]): SubtaskInput[] =>
  items.map((item) =>
    typeof item === "string"
      ? { id: newId(), label: item }
      : {
          id: newId(),
          label: item.label,
          ...(item.number !== undefined && { number: item.number }),
        },
  );

const fieldsInput = (fields: TaskFieldsForm): { ticket?: string; submitVia?: string } => ({
  ...(fields.ticket !== undefined && { ticket: fields.ticket }),
  ...(fields.submitVia !== undefined && { submitVia: fields.submitVia }),
});

type Schedule = {
  readonly dueAt?: string;
  readonly dueTz?: string;
  readonly startAt?: string;
  readonly startTz?: string;
};

const schedule = (form: ScheduleForm, deviceTz: string): Schedule => ({
  ...(form.dueAt !== undefined && { dueAt: form.dueAt, dueTz: form.dueTz ?? deviceTz }),
  ...(form.startAt !== undefined && { startAt: form.startAt, startTz: form.startTz ?? deviceTz }),
});

const NO_PROJECT: ResolvedProject & { readonly projectId: "" } = { projectId: "", events: [] };

const projectOf = (
  deps: ActionDeps,
  form: CreateTaskForm,
): Result<ResolvedProject, "action/invalid-input" | "action/unknown-project"> => {
  if (form.projectId !== undefined) {
    return resolveProject(deps, { projectId: form.projectId }, form);
  }
  return form.projectName === undefined || form.projectName.trim() === ""
    ? { ok: true, value: NO_PROJECT }
    : resolveProject(deps, { projectName: form.projectName }, form);
};

const createTask =
  (deps: ActionDeps): TaskActions["createTask"] =>
  async (form) => {
    const project = projectOf(deps, form);
    if (!project.ok) {
      return project;
    }
    const { projectId, events } = project.value;
    const created = stamp(
      deps,
      {
        type: "task.created",
        payload: {
          taskId: newId(),
          title: form.title,
          presetId: form.presetId,
          ...(projectId !== "" && { projectId }),
          ...(form.importance !== undefined && { importance: form.importance }),
          ...schedule(form, deps.clock.deviceTz),
          ...(form.estimateMinutes !== undefined && { estimateMinutes: form.estimateMinutes }),
          subtasks: subtaskInputs(form.subtasks ?? []),
          ...(form.description !== undefined && { description: form.description }),
          ...(form.sourceText !== undefined && { sourceText: form.sourceText }),
          fields: fieldsInput(form.fields ?? {}),
        },
      },
      form,
    );
    return await emit(deps, [...events, created]);
  };

const updateTask =
  (deps: ActionDeps): TaskActions["updateTask"] =>
  async (taskId, patch) => {
    const payload = {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...schedule(patch, deps.clock.deviceTz),
      ...(patch.fields !== undefined && { fields: fieldsInput(patch.fields) }),
    };
    if (Object.keys(payload).length === 0) {
      return err("action/nothing-to-do");
    }
    return await emit(deps, [
      stamp(deps, { type: "task.updated", payload: { taskId, ...payload } }),
    ]);
  };

const setProject =
  (deps: ActionDeps): TaskActions["setProject"] =>
  async (taskId, target) => {
    const resolved =
      target === null ? { ok: true as const, value: NO_PROJECT } : resolveProject(deps, target);
    if (!resolved.ok) {
      return resolved;
    }
    const projectId = resolved.value.projectId === "" ? null : resolved.value.projectId;
    return await emit(deps, [
      ...resolved.value.events,
      stamp(deps, { type: "task.project.set", payload: { taskId, projectId } }),
    ]);
  };

export const taskActions = (deps: ActionDeps): TaskActions => ({
  createTask: createTask(deps),
  setProject: setProject(deps),
  updateTask: updateTask(deps),
});
