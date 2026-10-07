import { z } from "zod";

import {
  type CoreState,
  err,
  type EventInput,
  findProjectByName,
  ImportanceSchema,
  newId,
  ok,
  PrecisionSchema,
  projectById,
  type Result,
  type Task,
  taskById,
  TimeZoneSchema,
} from "@pace/core";

import {
  type Build,
  stamp,
  type TargetBuild,
  type ToolFailure,
  type When,
  withTarget,
} from "./tool-kit.ts";

/** Input pieces the mutating tools share, and the normalizers that turn them into payloads. */

export const WRITE_INPUT = {
  at: z.iso
    .datetime()
    .optional()
    .describe(
      "When it happened, ISO 8601 UTC (e.g. 2026-10-07T18:30:00Z). Defaults to now; give a past instant to record something retroactively.",
    ),
  precision: PrecisionSchema.optional().describe(
    '"exact" (default) or "approx" when `at` is an estimate.',
  ),
  dryRun: z
    .boolean()
    .optional()
    .describe("true: validate and return the events that would be recorded, without writing."),
};

export const TASK_ID = z
  .string()
  .min(1)
  .describe("The task id (from list_now, get_task or search).");

export const IMPORTANCE = ImportanceSchema.describe(
  "asap (today), prioritized (within ~3 days), normal, nice_to_have.",
);

export const TIME_ZONE = TimeZoneSchema.describe("IANA time zone, e.g. Europe/Moscow.");

/** A subtask as callers write it: a bare label, or a label with its problem number. */
export const SUBTASK_INPUT = z.union([
  z.string().min(1),
  z.object({ label: z.string().min(1), number: z.int().min(0).optional() }),
]);

export type SubtaskInput = z.output<typeof SUBTASK_INPUT>;

export type SubtaskPayload = {
  readonly id: string;
  readonly label: string;
  readonly number?: number;
};

/** A bare label that is just a number ("3") is the problem number as well. */
const numberOf = (item: SubtaskInput): number | undefined => {
  if (typeof item !== "string") {
    return item.number;
  }
  return /^\d+$/.test(item.trim()) ? Number(item.trim()) : undefined;
};

export const toSubtasks = (items: readonly SubtaskInput[]): readonly SubtaskPayload[] =>
  items.map((item) => {
    const number = numberOf(item);
    const label = typeof item === "string" ? item.trim() : item.label.trim();
    return { id: newId(), label, ...(number !== undefined && { number }) };
  });

export const PROJECT_REF = {
  projectId: z.string().min(1).optional().describe("An existing project's id."),
  projectName: z
    .string()
    .min(1)
    .optional()
    .describe("A project by name; created on the fly when no project has that name."),
};

export type ProjectRef = {
  readonly projectId?: string | undefined;
  readonly projectName?: string | undefined;
};

export type ResolvedProject = {
  /** `undefined` when no project was named. */
  readonly projectId: string | undefined;
  /** The `project.created` to record first when the name was new. */
  readonly events: readonly EventInput[];
};

/** A project by id (must exist) or by name (reused, else created now). */
export const resolveProject = (
  state: CoreState,
  ref: ProjectRef,
  when: When,
): Result<ResolvedProject, ToolFailure> => {
  if (ref.projectId !== undefined) {
    return projectById(state.projects, ref.projectId) === undefined
      ? err({ code: "project/unknown", message: `No project with id ${ref.projectId}` })
      : ok({ events: [], projectId: ref.projectId });
  }
  const name = ref.projectName?.trim();
  if (name === undefined || name === "") {
    return ok({ events: [], projectId: undefined });
  }
  const existing = findProjectByName(state.projects, name);
  if (existing !== undefined) {
    return ok({ events: [], projectId: existing.id });
  }
  const projectId = newId();
  return ok({
    events: [stamp(when, { payload: { name, projectId }, type: "project.created" })],
    projectId,
  });
};

/** A project named by id or by name, for the read tools. */
export const findProject = (state: CoreState, ref: ProjectRef): Result<string, ToolFailure> => {
  if (ref.projectId !== undefined) {
    return projectById(state.projects, ref.projectId) === undefined
      ? err({ code: "project/unknown", message: `No project with id ${ref.projectId}` })
      : ok(ref.projectId);
  }
  const found =
    ref.projectName === undefined ? undefined : findProjectByName(state.projects, ref.projectName);
  return found === undefined
    ? err({ code: "project/unknown", message: "Give projectId or the name of an existing project" })
    : ok(found.id);
};

const requireTask = (state: CoreState, taskId: string): Result<Task, ToolFailure> => {
  const task = taskById(state.tasks, taskId);
  return task === undefined
    ? err({ code: "task/unknown", message: `No task with id ${taskId}` })
    : ok(task);
};

/** The build of a write about one existing task. */
export const forTask = (taskId: string, build: TargetBuild<Task>): Build =>
  withTarget((scope) => requireTask(scope.state, taskId), build);

/** Zoned instants as tools take them: the zone defaults to the account's. */
export type ZonedInput = {
  readonly dueAt?: string | undefined;
  readonly dueTz?: string | undefined;
  readonly startAt?: string | undefined;
  readonly startTz?: string | undefined;
};

export type ZonedPayload = {
  readonly dueAt: string | undefined;
  readonly dueTz: string | undefined;
  readonly startAt: string | undefined;
  readonly startTz: string | undefined;
};

/** A zone without its instant is dropped: it would change nothing but the stored zone. */
export const zonedPayload = (input: ZonedInput, zone: string): ZonedPayload => ({
  dueAt: input.dueAt,
  dueTz: input.dueAt === undefined ? undefined : (input.dueTz ?? zone),
  startAt: input.startAt,
  startTz: input.startAt === undefined ? undefined : (input.startTz ?? zone),
});
