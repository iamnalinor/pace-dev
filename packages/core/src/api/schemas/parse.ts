import { z } from "zod";

import { ACTIVITY_CATEGORIES } from "../../events/payloads.ts";
import { ParseFieldSchema, ParseResultSchema } from "../../parse/schema.ts";

export const ParseRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  /** When no model can answer now: keep the text and read it (and write it) once one can. */
  defer: z.boolean().optional(),
  /** A reading while the person is still typing: answered, but kept out of the decision log. */
  draft: z.boolean().optional(),
});

/**
A parse checked against the message (`doubtful` fields could not be), or the news that no
model can answer right now and when one should again.
*/
export const ParseResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("parsed"),
    result: ParseResultSchema,
    doubtful: z.array(ParseFieldSchema),
    isClean: z.boolean(),
    provider: z.string(),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    retryAt: z.iso.datetime().nullable(),
  }),
  /** Kept to be read once a model is back (asked with `defer`). */
  z.strictObject({
    status: z.literal("queued"),
    retryAt: z.iso.datetime().nullable(),
  }),
]);

/** What the assistant reads from a note of what the person is doing ("Пошёл в ЦСС, 20 мин"). */
export const ActivityReadingSchema = z.object({
  label: z.string().trim().min(1).max(80),
  category: z.enum(ACTIVITY_CATEGORIES),
  expectMinutes: z.number().int().min(1).max(1440).nullable(),
});

export type ActivityReading = z.output<typeof ActivityReadingSchema>;

export const ActivityParseRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(200),
});

/** The reading, or the news that no model can answer now (the activity keeps its words). */
export const ActivityParseResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("parsed"),
    reading: ActivityReadingSchema,
    provider: z.string(),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    retryAt: z.iso.datetime().nullable(),
  }),
]);

export type ActivityParseResponse = z.output<typeof ActivityParseResponseSchema>;

/** Whether the assistant can read now, or when it should again. */
export const LlmStatusSchema = z.strictObject({
  available: z.boolean(),
  retryAt: z.iso.datetime().nullable(),
});

export type ParseResponse = z.output<typeof ParseResponseSchema>;
