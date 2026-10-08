import { z } from "zod";

import { ParseFieldSchema, ParseResultSchema } from "../../parse/schema.ts";

export const ParseRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  /** When no model can answer now: keep the text and read it (and write it) once one can. */
  defer: z.boolean().optional(),
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

/** Whether the assistant can read now, or when it should again. */
export const LlmStatusSchema = z.strictObject({
  available: z.boolean(),
  retryAt: z.iso.datetime().nullable(),
});

export type ParseResponse = z.output<typeof ParseResponseSchema>;
