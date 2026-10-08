import { z } from "zod";

import { ImportanceSchema } from "../events/payloads.ts";

/**
What the LLM may answer for one message, flat and strict (every key present, `null` when
absent) so providers can enforce it as a JSON schema. Strings it extracts must be copied
from the message verbatim; `evidence` quotes the words each number or date came from.
*/
export const PARSE_INTENTS = [
  "create_task",
  "add_to_task",
  "mark_subtasks",
  "close_task",
  "unknown",
] as const;

export const ParseIntentSchema = z.enum(PARSE_INTENTS);

export type ParseIntent = z.output<typeof ParseIntentSchema>;

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

export const ParseResultSchema = z.strictObject({
  intent: ParseIntentSchema,
  /** The task's title, in the words of the message. */
  title: z.string().max(300).nullable(),
  /** A category (preset) id from the list given in the prompt. */
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
  subtasks: z.array(ParsedSubtaskSchema).max(100),
  /** For add/mark/close: the existing task's id from the list, or its title as written. */
  task: z.string().max(300).nullable(),
  outcome: z.enum(["done", "cancelled", "skipped"]).nullable(),
  description: z.string().max(4000).nullable(),
  questions: z.array(ParseQuestionSchema).max(5),
  evidence: z.array(ParseEvidenceSchema).max(30),
});

export type ParseResult = z.output<typeof ParseResultSchema>;
