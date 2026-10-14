import { z } from "zod";

import type { ProposalKind } from "./kinds.ts";

import {
  ACTIVITY_CATEGORIES,
  ImportanceSchema,
  InstantSchema,
  TimeZoneSchema,
} from "../events/payloads.ts";
import { ParseFieldSchema } from "../parse/schema.ts";

const ActivityCategoryOnly = z.enum(ACTIVITY_CATEGORIES);

export const SubtaskDraftSchema = z.strictObject({
  label: z.string().trim().min(1).max(200),
  number: z.number().int().min(0).max(999).nullable(),
});

export type SubtaskDraft = z.output<typeof SubtaskDraftSchema>;

/** The create form's fields, resolved: ids where they exist, a project name to create otherwise. */
export const TaskDraftSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  presetId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  /** A project to create on accept (named in the message, not in the list yet). */
  projectName: z.string().trim().min(1).max(100).nullable(),
  /** `null`: the category's default. */
  importance: ImportanceSchema.nullable(),
  dueAt: InstantSchema.nullable(),
  dueTz: TimeZoneSchema.nullable(),
  estimateMinutes: z.number().int().min(1).max(10_080).nullable(),
  subtasks: z.array(SubtaskDraftSchema).max(100),
  description: z.string().max(4000).nullable(),
  link: z.string().max(2000).nullable(),
  /** The message the task was read from, kept verbatim as its source. */
  sourceText: z.string().max(4000).nullable(),
});

export type TaskDraft = z.output<typeof TaskDraftSchema>;

const IdSchema = z.string().min(1);

const SubtaskRenameSchema = z.strictObject({
  subtaskId: IdSchema,
  label: z.string().trim().min(1),
});

/** Problems added, taken off by id, renamed by id. */
const SubtaskEditsSchema = z.strictObject({
  add: z.array(SubtaskDraftSchema).max(100).optional(),
  remove: z.array(IdSchema).max(100).optional(),
  rename: z.array(SubtaskRenameSchema).max(100).optional(),
});

/** What a task edit may change; an absent key stays as it is, `null` clears. */
export const TaskPatchSchema = z.strictObject({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(4000).nullable().optional(),
  /** `null` clears the due date; a set one carries its zone. */
  due: z.strictObject({ at: InstantSchema, tz: TimeZoneSchema }).nullable().optional(),
  importance: ImportanceSchema.optional(),
  /** `null` takes the task out of its project. */
  projectId: z.string().min(1).nullable().optional(),
  /** Moves the task into a project created by this name. */
  projectName: z.string().trim().min(1).max(100).optional(),
  presetId: z.string().min(1).optional(),
  estimateMinutes: z.number().int().min(1).max(10_080).nullable().optional(),
  link: z.string().max(2000).nullable().optional(),
  subtasks: SubtaskEditsSchema.optional(),
});

export type TaskPatch = z.output<typeof TaskPatchSchema>;

export const ActivityPatchSchema = z.strictObject({
  start: InstantSchema.optional(),
  end: InstantSchema.optional(),
  category: ActivityCategoryOnly.optional(),
  label: z.string().trim().min(1).max(80).optional(),
});

export type ActivityPatch = z.output<typeof ActivityPatchSchema>;

const taskRef = { taskId: z.string().min(1) };
const activityRef = { activityId: z.string().min(1) };

const display = {
  /** One line for the person, written by code in the account's language. */
  summary: z.string().min(1).max(500),
  /** Fields the assistant gave without a quote from the message: shown marked. */
  doubtful: z.array(ParseFieldSchema).optional(),
};

/** Every kind with `extra` fields: none for what `planProposal` reads, `display` for the answer. */
const proposalUnion = <E extends z.ZodRawShape>(extra: E) =>
  z.discriminatedUnion("kind", [
    z.strictObject({ ...extra, kind: z.literal("task.create"), task: TaskDraftSchema }),
    z.strictObject({
      ...extra,
      kind: z.literal("task.update"),
      ...taskRef,
      patch: TaskPatchSchema,
    }),
    z.strictObject({ ...extra, kind: z.literal("task.delete"), ...taskRef }),
    z.strictObject({
      ...extra,
      kind: z.literal("task.close"),
      ...taskRef,
      outcome: z.enum(["done", "cancelled", "skipped"]),
    }),
    z.strictObject({
      ...extra,
      kind: z.literal("task.addSubtasks"),
      ...taskRef,
      subtasks: z.array(SubtaskDraftSchema).min(1).max(100),
    }),
    z.strictObject({
      ...extra,
      kind: z.literal("task.markSubtasks"),
      ...taskRef,
      subtaskIds: z.array(IdSchema).min(1).max(100),
    }),
    z.strictObject({
      ...extra,
      kind: z.literal("activity.start"),
      category: ActivityCategoryOnly,
      label: z.string().trim().min(1).max(80),
      expectMinutes: z.number().int().min(1).max(1440).nullable().optional(),
      /** Begun earlier ("since 7:30"): the start goes back to it; absent means now. */
      startAt: InstantSchema.optional(),
    }),
    z.strictObject({
      ...extra,
      kind: z.literal("activity.log"),
      start: InstantSchema,
      end: InstantSchema,
      category: ActivityCategoryOnly,
      label: z.string().trim().min(1).max(80),
    }),
    z.strictObject({
      ...extra,
      kind: z.literal("activity.update"),
      ...activityRef,
      patch: ActivityPatchSchema,
    }),
    z.strictObject({ ...extra, kind: z.literal("activity.delete"), ...activityRef }),
  ]);

/** A proposal without its display fields: what `planProposal` reads. */
export const ProposalBodySchema = proposalUnion({});

export type ProposalBody = z.output<typeof ProposalBodySchema>;

export type ProposalBodyOf<K extends ProposalKind> = Extract<ProposalBody, { readonly kind: K }>;

/** A proposal as the API answers it: the body, its summary and its doubtful fields. */
export const ProposalSchema = proposalUnion(display);

export type Proposal = z.output<typeof ProposalSchema>;
