import { z } from "zod";

import type { ProposalKind } from "./kinds.ts";

import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_LABEL_MAX,
  ImportanceSchema,
  InstantSchema,
  TimeZoneSchema,
} from "../events/payloads.ts";
import { ParseFieldSchema } from "../parse/schema.ts";
import { PROPOSAL_LIMITS as LIMITS } from "./limits.ts";

const ActivityCategoryOnly = z.enum(ACTIVITY_CATEGORIES);

const ActivityLabelSchema = z.string().trim().min(1).max(ACTIVITY_LABEL_MAX);

export const SubtaskDraftSchema = z.object({
  label: z.string().trim().min(1).max(LIMITS.subtaskLabel),
  number: z.number().int().min(0).max(999).nullable(),
});

export type SubtaskDraft = z.output<typeof SubtaskDraftSchema>;

/** The create form's fields, resolved: ids where they exist, a project name to create otherwise. */
export const TaskDraftSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.title),
  presetId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  /** A project to create on accept (named in the message, not in the list yet). */
  projectName: z.string().trim().min(1).max(LIMITS.projectName).nullable(),
  /** `null`: the category's default. */
  importance: ImportanceSchema.nullable(),
  dueAt: InstantSchema.nullable(),
  dueTz: TimeZoneSchema.nullable(),
  estimateMinutes: z.number().int().min(1).max(LIMITS.estimateMinutes).nullable(),
  subtasks: z.array(SubtaskDraftSchema).max(LIMITS.subtasks),
  description: z.string().max(4000).nullable(),
  link: z.string().max(LIMITS.link).nullable(),
  /** The message the task was read from, kept verbatim as its source. */
  sourceText: z.string().max(4000).nullable(),
});

export type TaskDraft = z.output<typeof TaskDraftSchema>;

const IdSchema = z.string().min(1);

const SubtaskRenameSchema = z.object({
  subtaskId: IdSchema,
  label: z.string().trim().min(1),
});

/** Problems added, taken off by id, renamed by id. */
const SubtaskEditsSchema = z.object({
  add: z.array(SubtaskDraftSchema).max(LIMITS.subtasks).optional(),
  remove: z.array(IdSchema).max(100).optional(),
  rename: z.array(SubtaskRenameSchema).max(100).optional(),
});

/** What a task edit may change; an absent key stays as it is, `null` clears. */
export const TaskPatchSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.title).optional(),
  description: z.string().max(4000).nullable().optional(),
  /** `null` clears the due date; a set one carries its zone. */
  due: z.object({ at: InstantSchema, tz: TimeZoneSchema }).nullable().optional(),
  importance: ImportanceSchema.optional(),
  /** `null` takes the task out of its project. */
  projectId: z.string().min(1).nullable().optional(),
  /** Moves the task into a project created by this name. */
  projectName: z.string().trim().min(1).max(LIMITS.projectName).optional(),
  presetId: z.string().min(1).optional(),
  estimateMinutes: z.number().int().min(1).max(LIMITS.estimateMinutes).nullable().optional(),
  link: z.string().max(LIMITS.link).nullable().optional(),
  subtasks: SubtaskEditsSchema.optional(),
});

export type TaskPatch = z.output<typeof TaskPatchSchema>;

export const ActivityPatchSchema = z.object({
  start: InstantSchema.optional(),
  end: InstantSchema.optional(),
  category: ActivityCategoryOnly.optional(),
  label: ActivityLabelSchema.optional(),
});

export type ActivityPatch = z.output<typeof ActivityPatchSchema>;

const taskRef = { taskId: z.string().min(1) };
const activityRef = { activityId: z.string().min(1) };

const display = {
  /** One line for the person, written by code in the account's language. */
  summary: z.string().min(1).max(LIMITS.summary),
  /** Fields the assistant gave without a quote from the message: shown marked. */
  doubtful: z.array(ParseFieldSchema).optional(),
};

/**
Every kind with `extra` fields: none for what `planProposal` reads, `display` for the answer.
Loose objects throughout: the client reads them in the parse answer, where a newer server may
add keys; nothing here is read by the server from a request.
*/
const proposalUnion = <E extends z.ZodRawShape>(extra: E) =>
  z.discriminatedUnion("kind", [
    z.object({ ...extra, kind: z.literal("task.create"), task: TaskDraftSchema }),
    z.object({
      ...extra,
      kind: z.literal("task.update"),
      ...taskRef,
      patch: TaskPatchSchema,
    }),
    z.object({ ...extra, kind: z.literal("task.delete"), ...taskRef }),
    z.object({
      ...extra,
      kind: z.literal("task.close"),
      ...taskRef,
      outcome: z.enum(["done", "cancelled", "skipped"]),
    }),
    z.object({
      ...extra,
      kind: z.literal("task.addSubtasks"),
      ...taskRef,
      subtasks: z.array(SubtaskDraftSchema).min(1).max(LIMITS.subtasks),
    }),
    z.object({
      ...extra,
      kind: z.literal("task.markSubtasks"),
      ...taskRef,
      subtaskIds: z.array(IdSchema).min(1).max(100),
    }),
    z.object({
      ...extra,
      kind: z.literal("activity.start"),
      category: ActivityCategoryOnly,
      label: ActivityLabelSchema,
      expectMinutes: z.number().int().min(1).max(LIMITS.expectMinutes).nullable().optional(),
      /** Begun earlier ("since 7:30"): the start goes back to it; absent means now. */
      startAt: InstantSchema.optional(),
    }),
    z.object({
      ...extra,
      kind: z.literal("activity.log"),
      start: InstantSchema,
      end: InstantSchema,
      category: ActivityCategoryOnly,
      label: ActivityLabelSchema,
    }),
    z.object({
      ...extra,
      kind: z.literal("activity.update"),
      ...activityRef,
      patch: ActivityPatchSchema,
    }),
    z.object({ ...extra, kind: z.literal("activity.delete"), ...activityRef }),
  ]);

/** A proposal without its display fields: what `planProposal` reads. */
export const ProposalBodySchema = proposalUnion({});

export type ProposalBody = z.output<typeof ProposalBodySchema>;

export type ProposalBodyOf<K extends ProposalKind> = Extract<ProposalBody, { readonly kind: K }>;

/** A proposal as the API answers it: the body, its summary and its doubtful fields. */
export const ProposalSchema = proposalUnion(display);

export type Proposal = z.output<typeof ProposalSchema>;
