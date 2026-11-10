import { z } from "zod";

import type { PresetDefinition, Weekday } from "../model/preset.ts";

import {
  ImportanceSchema,
  InstantSchema,
  ProjectColorSchema,
  TimeZoneSchema,
} from "../events/payloads.ts";
import { err, ok, type Result } from "../result.ts";

/**
Lowercase slug: `[a-z0-9]` segments joined by single `.` or `-`, 1–64 characters. Each
separator must be followed by a segment character, which rules out trailing and doubled
separators without a nested quantifier.
*/
export const PresetIdSchema = z
  .string()
  .max(64)
  .regex(
    /^[a-z0-9](?:[a-z0-9]|[.-](?=[a-z0-9]))*$/,
    "Expected a lowercase slug (a-z, 0-9, '.', '-')",
  );

const TimeOfDaySchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

const WEEKDAY_NAMES: Readonly<Record<string, Weekday>> = {
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 7,
  sunday: 7,
};

/** A weekday name (`"wed"`, `"Wednesday"`, any case) as its ISO number; anything else as given. */
const weekdayNumber = (value: unknown): unknown =>
  typeof value === "string" ? (WEEKDAY_NAMES[value.trim().toLowerCase()] ?? value) : value;

/** What the error text says about a weekday, so an MCP caller can fix the value. */
const WEEKDAY_HINT =
  "Expected a weekday: 1-7 (1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday, 7 = Sunday) or its English name ('wed', 'Wednesday'; any case)";

/** Names are read as numbers, so a definition always stores (and old clients read) the number. */
const WeekdaySchema = z.preprocess(
  weekdayNumber,
  z.literal([1, 2, 3, 4, 5, 6, 7], { error: WEEKDAY_HINT }),
);

const WeekSlotSchema = z.strictObject({
  weekday: WeekdaySchema,
  time: TimeOfDaySchema,
});

const RecurrenceSchema = z.strictObject({
  issued: WeekSlotSchema,
  due: WeekSlotSchema,
  tz: TimeZoneSchema,
  firstNumber: z
    .int({ error: "Expected a whole number (the first instance's number)" })
    .min(0)
    .exactOptional(),
});

const DeadlinePolicySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hard") }),
  z
    .strictObject({
      kind: z.literal("resubmission"),
      softDays: z.int().min(0),
      finalMode: z.enum(["fixed", "offset"]).optional(),
      finalAt: InstantSchema.nullable(),
      finalTz: TimeZoneSchema.nullable(),
    })
    .refine((policy) => policy.finalAt === null || policy.finalTz !== null, {
      message: "finalTz is required with finalAt",
      path: ["finalTz"],
    })
    .refine((policy) => policy.finalMode !== "fixed" || policy.finalAt !== null, {
      message: "A fixed final deadline needs a date",
      path: ["finalAt"],
    })
    .refine((policy) => policy.finalMode !== "offset" || policy.finalAt === null, {
      message: "An offset final deadline has no fixed date",
      path: ["finalAt"],
    }),
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Presets saved before `link` replaced `ticket` keep their toggle under the new name. */
const renameLegacyTicket = (value: unknown): unknown => {
  if (!isRecord(value) || !("ticket" in value)) {
    return value;
  }
  const { ticket, ...rest } = value;
  return "link" in rest ? rest : { ...rest, link: ticket };
};

const FieldsSchema = z.preprocess(
  renameLegacyTicket,
  z.strictObject({
    link: z.boolean().exactOptional(),
    description: z.boolean().exactOptional(),
    startAt: z.boolean().exactOptional(),
    submitVia: z.boolean().exactOptional(),
  }),
);

/**
Legacy: the submission mode (`whole` / `per_subtask`) went on 2026-11-09 (a task's check closes
it, subtasks are marked one by one). Accepted so old events and old clients parse, then dropped
(`parsePresetDefinition`); nothing reads it.
*/
const LegacySubmissionSchema = z.enum(["per_subtask", "whole"]);

/**
Legacy: notification thresholds no feature ever read (score alerts and the waiting status went
in stage 6, the rest in stage 8). Accepted so old events parse, then dropped
(`parsePresetDefinition`).
*/
const LegacyNotifySchema = z.strictObject({
  criticalHours: z.number().min(0).exactOptional(),
  criticalProgress: z.number().min(0).max(1).exactOptional(),
  criticalScore: z.number().min(0).exactOptional(),
  waitingDays: z.number().min(0).exactOptional(),
  inProgressIdleDays: z.number().min(0).exactOptional(),
});

/**
Strict: unknown keys fail, so a typo in the editor or an MCP call cannot silently become
an ignored setting. Every key is exact-optional (absent, never `undefined`) because a
preset stores only what it changes.
*/
export const PresetDefinitionSchema = z.strictObject({
  // Legacy (urgency scoring was removed in stage 6): accepted so old events parse, ignored.
  urgencyPolicy: z.enum(["age", "lag", "pace", "resubmission"]).exactOptional(),
  defaultImportance: ImportanceSchema.exactOptional(),
  deadlinePolicy: DeadlinePolicySchema.exactOptional(),
  // Deprecated (2026-11-09): read and dropped, see `LegacySubmissionSchema`.
  submission: LegacySubmissionSchema.exactOptional(),
  progressMode: z.enum(["none", "slider", "subtasks"]).exactOptional(),
  recurrence: RecurrenceSchema.nullable().exactOptional(),
  fields: FieldsSchema.exactOptional(),
  notify: LegacyNotifySchema.exactOptional(),
  defaultEstimateMinutes: z.int().min(0).exactOptional(),
  color: ProjectColorSchema.exactOptional(),
});

/**
Every refusal as `key.path: reason`, joined by `; ` (`(definition)` for the top level), so the
person or the MCP client sees which key or value to fix (feedback 5).
*/
const describeIssues = (issues: readonly z.core.$ZodIssue[]): string =>
  issues
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      return `${path === "" ? "(definition)" : path}: ${issue.message}`;
    })
    .join("; ");

/** A stored or entered definition, checked; the legacy thresholds and submission mode are dropped. */
export const parsePresetDefinition = (value: unknown): Result<PresetDefinition, string> => {
  const parsed = PresetDefinitionSchema.safeParse(value);
  if (parsed.success) {
    const { notify: _thresholds, submission: _submission, ...definition } = parsed.data;
    return ok(definition);
  }
  return err(describeIssues(parsed.error.issues));
};
