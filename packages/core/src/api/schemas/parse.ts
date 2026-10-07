import { z } from "zod";

import { ParseFieldSchema, ParseResultSchema } from "../../parse/schema.ts";

export const ParseRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
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
]);

export type ParseResponse = z.output<typeof ParseResponseSchema>;
