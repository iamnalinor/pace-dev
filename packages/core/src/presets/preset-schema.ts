import { z } from "zod";

import type { PresetDefinition } from "../model/preset.ts";

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

const WeekSlotSchema = z.strictObject({
  weekday: z.literal([1, 2, 3, 4, 5, 6, 7]),
  time: TimeOfDaySchema,
});

const RecurrenceSchema = z.strictObject({
  issued: WeekSlotSchema,
  due: WeekSlotSchema,
  tz: TimeZoneSchema,
});

const DeadlinePolicySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hard") }),
  z
    .strictObject({
      kind: z.literal("resubmission"),
      softDays: z.int().min(0),
      finalAt: InstantSchema.nullable(),
      finalTz: TimeZoneSchema.nullable(),
    })
    .refine((policy) => policy.finalAt === null || policy.finalTz !== null, {
      message: "finalTz is required with finalAt",
      path: ["finalTz"],
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

const NotifySchema = z.strictObject({
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
  urgencyPolicy: z.enum(["age", "lag", "pace", "resubmission"]).exactOptional(),
  defaultImportance: ImportanceSchema.exactOptional(),
  deadlinePolicy: DeadlinePolicySchema.exactOptional(),
  submission: z.enum(["per_subtask", "whole"]).exactOptional(),
  progressMode: z.enum(["none", "slider", "subtasks"]).exactOptional(),
  recurrence: RecurrenceSchema.nullable().exactOptional(),
  fields: FieldsSchema.exactOptional(),
  notify: NotifySchema.exactOptional(),
  defaultEstimateMinutes: z.int().min(0).exactOptional(),
  color: ProjectColorSchema.exactOptional(),
});

export const parsePresetDefinition = (value: unknown): Result<PresetDefinition, string> => {
  const parsed = PresetDefinitionSchema.safeParse(value);
  return parsed.success
    ? ok(parsed.data)
    : err(
        parsed.error.issues
          .map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`)
          .join("; "),
      );
};
