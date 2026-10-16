import { z } from "zod";

import { ACTION_KINDS, ParseDomainSchema } from "../actions/kinds.ts";
import { ImportanceSchema } from "../events/payloads.ts";

/** The fields of a reading the person may be asked to double-check. */
export const PARSE_FIELDS = [
  "title",
  "category",
  "project",
  "importance",
  "dueDate",
  "dueTime",
  "estimateMinutes",
  "subtasks",
  "task",
  "outcome",
  "description",
  "label",
  "start",
  "end",
  "expectMinutes",
  "link",
] as const;

export const ParseFieldSchema = z.enum(PARSE_FIELDS);

export type ParseField = z.output<typeof ParseFieldSchema>;

const ParsedSubtaskSchema = z.strictObject({
  label: z.string().min(1).max(200),
  number: z.number().int().min(0).max(999).nullable(),
});

export const ParseQuestionSchema = z.strictObject({
  field: ParseFieldSchema,
  question: z.string().min(1).max(300),
  options: z.array(z.string().min(1).max(100)).max(6),
});

export type ParseQuestion = z.output<typeof ParseQuestionSchema>;

export const ParseEvidenceSchema = z.strictObject({
  field: ParseFieldSchema,
  quote: z.string().min(1).max(300),
});

const SubtaskNameSchema = z.string().min(1).max(200);

/** An existing subtask by label or number, and its new label. */
const RenameSchema = z.strictObject({ subtask: SubtaskNameSchema, label: SubtaskNameSchema });

/** `YYYY-MM-DD HH:MM` on the account's wall clock. */
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/u;

/** What an edit may empty: a due date, an estimate, a project, a description, a link. */
export const CLEARABLE = ["dueDate", "estimateMinutes", "project", "description", "link"] as const;

/**
One thing the model proposes, flat and strict (every key present, `null` or empty when it does
not apply) so providers can enforce it as a JSON schema. Tasks and activities are named by the
short aliases of the lists in the prompt ("t3", "a2"), never by their ids; code maps them back.
Strings it extracts are copied from the message verbatim; `evidence` quotes the words each
number, date or time came from.
*/
export const ModelActionSchema = z.strictObject({
  kind: z.enum(ACTION_KINDS),
  /** An open task's alias from the list, for every task kind but a create. */
  task: z.string().max(20).nullable(),
  /** An activity's alias from the list, for an activity's edit or delete. */
  activity: z.string().max(20).nullable(),
  /** For a delete: the item's title (or label) exactly as listed, so the right one goes. */
  quote: z.string().max(300).nullable(),
  /** The task's title, in the words of the message. */
  title: z.string().max(300).nullable(),
  /** A task category (preset) id from the list, or an activity category. */
  category: z.string().max(100).nullable(),
  /** A project name: one from the list, or a new one named in the message. */
  project: z.string().max(100).nullable(),
  importance: ImportanceSchema.nullable(),
  /** `YYYY-MM-DD` in the account's zone. */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .nullable(),
  /** `HH:MM`, 24-hour, in the account's zone. */
  dueTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/u)
    .nullable(),
  estimateMinutes: z.number().int().min(1).max(10_080).nullable(),
  description: z.string().max(4000).nullable(),
  /** A web address the task is about, copied from the message. */
  link: z.string().max(2000).nullable(),
  /** Subtasks to add (a create's, an edit's or an add's). */
  subtasks: z.array(ParsedSubtaskSchema).max(100),
  /** Existing subtasks by label or number: to mark solved, or (an edit) to remove. */
  subtaskRefs: z.array(SubtaskNameSchema).max(100),
  /** An edit's renamed subtasks: the existing one by label or number, its new label. */
  renames: z.array(RenameSchema).max(50),
  /** What an edit empties. */
  clear: z.array(z.enum(CLEARABLE)).max(CLEARABLE.length),
  outcome: z.enum(["done", "cancelled", "skipped"]).nullable(),
  /** An activity's short name, in the message's language. */
  label: z.string().max(80).nullable(),
  /** An activity's start and end, `YYYY-MM-DD HH:MM` in the account's zone. */
  start: z.string().regex(WALL_CLOCK).nullable(),
  end: z.string().regex(WALL_CLOCK).nullable(),
  /** How long a started activity is expected to take. */
  expectMinutes: z.number().int().min(1).max(1440).nullable(),
  evidence: z.array(ParseEvidenceSchema).max(30),
});

export type ModelAction = z.output<typeof ModelActionSchema>;

/** An action of `kind` with nothing else set: what a reader fills in field by field. */
export const blankModelAction = (overrides: Partial<ModelAction>): ModelAction => ({
  activity: null,
  category: null,
  clear: [],
  description: null,
  dueDate: null,
  dueTime: null,
  end: null,
  estimateMinutes: null,
  evidence: [],
  expectMinutes: null,
  importance: null,
  kind: "task.create",
  label: null,
  link: null,
  outcome: null,
  project: null,
  quote: null,
  renames: [],
  start: null,
  subtaskRefs: [],
  subtasks: [],
  task: null,
  title: null,
  ...overrides,
});

/**
What the LLM answers for one message: which domain it is about (with how sure it is, when the
caller left that open) and what to do, plus questions for whatever stays ambiguous.
*/
export const ModelOutputSchema = z.strictObject({
  domain: ParseDomainSchema,
  confidence: z.number().min(0).max(1),
  actions: z.array(ModelActionSchema).max(10),
  questions: z.array(ParseQuestionSchema).max(5),
});

export type ModelOutput = z.output<typeof ModelOutputSchema>;
