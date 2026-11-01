import {
  type DeadlinePolicy,
  err,
  type Importance,
  newId,
  type Result,
  seriesAnchor,
  seriesInstanceId,
  type SeriesSchedule,
  seriesStartProblem,
} from "@pace/core";

import {
  type ActionDeps,
  type ActionResult,
  emit,
  fromStore,
  stamp,
  taskOf,
  type When,
} from "./deps.ts";
import { type ProjectTarget, type ResolvedProject, resolveProject } from "./projects.ts";

export type SubtaskForm = {
  readonly label: string;
  readonly number?: number | undefined;
};

export type TaskFieldsForm = {
  /** An http(s) address; when absent, the view takes the first one from the text. */
  readonly link?: string | undefined;
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
    readonly deadlinePolicy?: DeadlinePolicy | undefined;
    readonly recurrence?: SeriesSchedule | undefined;
    readonly subtasks?: readonly SubtaskForm[] | undefined;
    readonly description?: string | undefined;
    readonly sourceText?: string | undefined;
    readonly fields?: TaskFieldsForm | undefined;
  };

export type TaskPatch = {
  /** `null` clears the due date or the start. */
  readonly dueAt?: null | string | undefined;
  readonly dueTz?: string | undefined;
  readonly startAt?: null | string | undefined;
  readonly startTz?: string | undefined;
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
  /**
  Takes the task back as if it never was (its creation is revoked): gone from every list.
  The answer is the revocation, which Undo revokes in turn.
  */
  readonly deleteTask: (taskId: string) => ActionResult;
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

const fieldsInput = (fields: TaskFieldsForm): { link?: string; submitVia?: string } => ({
  ...(fields.link !== undefined && { link: fields.link }),
  ...(fields.submitVia !== undefined && { submitVia: fields.submitVia }),
});

type Schedule = {
  readonly dueAt?: string;
  readonly dueTz?: string;
  readonly startAt?: string;
  readonly startTz?: string;
};

/** A patch's dates: a set one with its zone (the device's by default), a cleared one as `null`. */
const patchSchedule = (
  patch: TaskPatch,
  deviceTz: string,
): {
  readonly dueAt?: null | string;
  readonly dueTz?: string;
  readonly startAt?: null | string;
  readonly startTz?: string;
} => ({
  ...(patch.dueAt === null && { dueAt: null }),
  ...(typeof patch.dueAt === "string" && { dueAt: patch.dueAt, dueTz: patch.dueTz ?? deviceTz }),
  ...(patch.startAt === null && { startAt: null }),
  ...(typeof patch.startAt === "string" && {
    startAt: patch.startAt,
    startTz: patch.startTz ?? deviceTz,
  }),
});

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

const taskDetails = (form: CreateTaskForm) => ({
  ...(form.importance !== undefined && { importance: form.importance }),
  ...(form.estimateMinutes !== undefined && { estimateMinutes: form.estimateMinutes }),
  subtasks: subtaskInputs(form.subtasks ?? []),
  ...(form.description !== undefined && { description: form.description }),
  ...(form.sourceText !== undefined && { sourceText: form.sourceText }),
  fields: fieldsInput(form.fields ?? {}),
  ...(form.deadlinePolicy !== undefined && { overrides: { deadlinePolicy: form.deadlinePolicy } }),
});

const taskPayload = (
  form: CreateTaskForm,
  options: {
    readonly projectId: string;
    readonly taskId: string;
    readonly start: { readonly at?: string; readonly tz: string };
    readonly seriesId?: string;
  },
) => ({
  taskId: options.taskId,
  title: form.title,
  presetId: form.presetId,
  ...(options.projectId !== "" && { projectId: options.projectId }),
  ...schedule(
    {
      ...form,
      ...(options.start.at !== undefined && {
        startAt: options.start.at,
        startTz: options.start.tz,
      }),
    },
    options.start.tz,
  ),
  ...taskDetails(form),
  ...(options.seriesId !== undefined && { seriesId: options.seriesId, seriesRevision: 0 }),
});

const recurringCreated = async (
  deps: ActionDeps,
  form: CreateTaskForm & { readonly recurrence: SeriesSchedule },
  project: ResolvedProject,
): ActionResult => {
  const seriesId = newId();
  const startAt = form.startAt ?? deps.clock.now();
  const startTz = form.startTz ?? deps.clock.deviceTz;
  const due = form.dueAt === undefined ? null : { at: form.dueAt };
  // The series counts from the chosen start, else from 00:00 today: the first instance starts
  // now, the next ones at the start of their day, not at this minute (QA round 14 L10e).
  const anchor = seriesAnchor(form.startAt, { at: startAt, tz: startTz });
  if (seriesStartProblem(form.recurrence, { due, start: { at: startAt, tz: startTz } }) !== null) {
    return err("action/invalid-input");
  }
  const payload = taskPayload(form, {
    projectId: project.projectId,
    taskId: seriesInstanceId(seriesId, "0", 0),
    start: { at: startAt, tz: startTz },
    seriesId,
  });
  const series = stamp(
    deps,
    {
      type: "series.created",
      payload: {
        seriesId,
        schedule: form.recurrence,
        template: { ...payload, startAt: anchor, startTz, seriesId, seriesRevision: 0 },
      },
    },
    form,
  );
  const first = stamp(deps, { type: "task.created", payload }, form);
  return await emit(deps, [
    ...project.events,
    series,
    { ...first, source: "system", id: payload.taskId },
  ]);
};

const createTask =
  (deps: ActionDeps): TaskActions["createTask"] =>
  async (form) => {
    const project = projectOf(deps, form);
    if (!project.ok) {
      return project;
    }
    const { projectId, events } = project.value;
    if (form.recurrence !== undefined) {
      return await recurringCreated(deps, { ...form, recurrence: form.recurrence }, project.value);
    }
    const payload = taskPayload(form, {
      projectId,
      taskId: newId(),
      start: {
        ...(form.startAt !== undefined && { at: form.startAt }),
        tz: form.startTz ?? deps.clock.deviceTz,
      },
    });
    return await emit(deps, [...events, stamp(deps, { type: "task.created", payload }, form)]);
  };

const updateTask =
  (deps: ActionDeps): TaskActions["updateTask"] =>
  async (taskId, patch) => {
    const payload = {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...patchSchedule(patch, deps.clock.deviceTz),
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

const deleteTask =
  (deps: ActionDeps): TaskActions["deleteTask"] =>
  async (taskId) => {
    const task = taskOf(deps, taskId);
    if (!task.ok) {
      return task;
    }
    const created = deps.state.store
      .getState()
      .events.find((event) => event.type === "task.created" && event.payload.taskId === taskId);
    return created === undefined
      ? err("task/unknown")
      : fromStore(await deps.state.revoke(created.id));
  };

export const taskActions = (deps: ActionDeps): TaskActions => ({
  createTask: createTask(deps),
  deleteTask: deleteTask(deps),
  setProject: setProject(deps),
  updateTask: updateTask(deps),
});
