import { z } from "zod";

import { isValidTimeZone } from "../time.ts";

/** UTC ISO 8601 instant (`...Z`): string order equals time order. */
export const InstantSchema = z.iso.datetime();

export const TimeZoneSchema = z
  .string()
  .refine(isValidTimeZone, { message: "Unknown IANA time zone" });

const ClockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const ImportanceSchema = z.enum(["asap", "prioritized", "normal", "nice_to_have"]);
export const TaskStatusSchema = z.enum(["not_started", "in_progress", "paused", "waiting"]);
export const CloseOutcomeSchema = z.enum(["done", "cancelled", "cancelled_missed", "skipped"]);
export const ProjectColorSchema = z.enum([
  "blue",
  "violet",
  "green",
  "amber",
  "coral",
  "pink",
  "teal",
  "slate",
]);

export const SubtaskSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  number: z.int().min(0).optional(),
});

export const TaskFieldsSchema = z.object({
  ticket: z.string().optional(),
  submitVia: z.string().optional(),
});

/** Preset overrides on a task: validated against the preset model elsewhere. */
const OpaqueRecordSchema = z.record(z.string(), z.unknown());

const taskRef = { taskId: z.string().min(1) };

type ZonedFields = {
  readonly dueAt?: string | undefined;
  readonly dueTz?: string | undefined;
  readonly startAt?: string | undefined;
  readonly startTz?: string | undefined;
};

const zonePaired = (value: ZonedFields, ctx: z.RefinementCtx): void => {
  if (value.dueAt !== undefined && value.dueTz === undefined) {
    ctx.addIssue({ code: "custom", message: "dueTz is required with dueAt", path: ["dueTz"] });
  }
  if (value.startAt !== undefined && value.startTz === undefined) {
    ctx.addIssue({
      code: "custom",
      message: "startTz is required with startAt",
      path: ["startTz"],
    });
  }
};

const zonedShape = {
  dueAt: InstantSchema.optional(),
  dueTz: TimeZoneSchema.optional(),
  startAt: InstantSchema.optional(),
  startTz: TimeZoneSchema.optional(),
};

export const TaskCreatedPayload = z
  .object({
    ...taskRef,
    title: z.string().min(1),
    presetId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    importance: ImportanceSchema.optional(),
    ...zonedShape,
    estimateMinutes: z.int().min(0).optional(),
    subtasks: z.array(SubtaskSchema).default([]),
    description: z.string().optional(),
    sourceText: z.string().optional(),
    fields: TaskFieldsSchema.default({}),
    overrides: OpaqueRecordSchema.optional(),
  })
  .superRefine(zonePaired);

export const TaskUpdatedPayload = z
  .object({
    ...taskRef,
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    ...zonedShape,
    fields: TaskFieldsSchema.optional(),
  })
  .superRefine(zonePaired);

export const TaskPresetSetPayload = z.object({ ...taskRef, presetId: z.string().min(1) });
export const TaskOverridesSetPayload = z.object({ ...taskRef, overrides: OpaqueRecordSchema });
export const TaskStatusSetPayload = z.object({ ...taskRef, status: TaskStatusSchema });
export const TaskSubtaskSolvedPayload = z.object({ ...taskRef, subtaskId: z.string().min(1) });
export const TaskSubtasksAddedPayload = z.object({
  ...taskRef,
  subtasks: z.array(SubtaskSchema).min(1),
});
/** `subtaskIds` absent means the whole task was submitted. */
export const TaskSubmittedPayload = z.object({
  ...taskRef,
  subtaskIds: z.array(z.string().min(1)).min(1).optional(),
  closes: z.boolean().optional(),
});
export const TaskClosedPayload = z.object({
  ...taskRef,
  outcome: CloseOutcomeSchema,
  reason: z.string().optional(),
  /** Set (by amendment) once the user has confirmed an automatic outcome in the review block. */
  confirmed: z.boolean().optional(),
});
export const TaskReopenedPayload = z.object(taskRef);
export const TaskImportanceSetPayload = z.object({ ...taskRef, importance: ImportanceSchema });
export const TaskProjectSetPayload = z.object({
  ...taskRef,
  projectId: z.string().min(1).nullable(),
});
export const TaskProgressSetPayload = z.object({ ...taskRef, progress: z.int().min(0).max(10) });
export const TaskEstimateSetPayload = z.object({
  ...taskRef,
  estimateMinutes: z.int().min(0).nullable(),
});
export const TaskRankSetPayload = z.object({ ...taskRef, rank: z.int().min(0) });
export const TaskSourceAttachedPayload = z.object({
  ...taskRef,
  sourceText: z.string().min(1),
  sourceUrl: z.url().optional(),
});

const projectRef = { projectId: z.string().min(1) };
export const ProjectCreatedPayload = z.object({
  ...projectRef,
  name: z.string().min(1),
  color: ProjectColorSchema.optional(),
  description: z.string().optional(),
});
export const ProjectUpdatedPayload = z.object({
  ...projectRef,
  name: z.string().min(1).optional(),
  color: ProjectColorSchema.optional(),
  description: z.string().nullable().optional(),
  archived: z.boolean().optional(),
});

/** Preset definitions are opaque here; the preset module validates them. */
export const PresetCreatedPayload = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  extends: z.string().min(1).optional(),
  definition: OpaqueRecordSchema,
});
export const PresetUpdatedPayload = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  extends: z.string().min(1).nullable().optional(),
  definition: OpaqueRecordSchema.optional(),
});
export const PresetArchivedPayload = z.object({ id: z.string().min(1) });

export const SettingsUpdatedPayload = z.object({
  language: z.enum(["en", "ru"]).optional(),
  timezone: TimeZoneSchema.optional(),
  digestWindows: z.array(ClockSchema).optional(),
  quietHours: z.object({ from: ClockSchema, to: ClockSchema }).optional(),
});

export const FocusStartedPayload = z.object(taskRef);
export const FocusEndedPayload = z.object(taskRef);

export const EventAmendedPayload = z.object({
  targetId: z.string().min(1),
  patch: OpaqueRecordSchema,
});
export const EventRevokedPayload = z.object({
  targetId: z.string().min(1),
  reason: z.string().optional(),
});
