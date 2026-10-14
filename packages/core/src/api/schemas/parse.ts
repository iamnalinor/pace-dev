import { z } from "zod";

import { ParseQuestionSchema } from "../../parse/schema.ts";
import { ParseDomainSchema } from "../../proposals/kinds.ts";
import { ProposalSchema } from "../../proposals/schema.ts";

export const ParseRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  /**
  The field it was typed into: the task line, the activity line, or `auto` (the bot's one field):
  then the assistant says which it is and how sure it is.
  */
  domain: z.enum(["task", "activity", "auto"]).default("task"),
  /** When no model can answer now: keep the text and read it (and write it) once one can. */
  defer: z.boolean().optional(),
  /** A reading while the person is still typing: answered, but kept out of the decision log. */
  draft: z.boolean().optional(),
});

export type ParseRequest = z.input<typeof ParseRequestSchema>;

const answer = {
  /** What the message is about: the field it came from, or the assistant's (or rules') reading. */
  domain: ParseDomainSchema,
  /** How sure that reading is, 0..1: 1 when the field said so. */
  confidence: z.number().min(0).max(1),
  /** What to do, each with its summary; nothing is written until the person accepts one. */
  proposals: z.array(ProposalSchema),
  /** What the assistant asks about what stays ambiguous, in the interface language. */
  questions: z.array(ParseQuestionSchema).optional(),
};

/**
The assistant's proposals for a message, checked against it (`parsed`); or, when no model can
answer right now, the rules' proposals and when one should be back (`unavailable`), or the news
that the text waits to be read and written then (`queued`, asked with `defer`).
*/
export const ParseResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("parsed"), ...answer, provider: z.string() }),
  z.strictObject({
    status: z.literal("unavailable"),
    ...answer,
    retryAt: z.iso.datetime().nullable(),
  }),
  z.strictObject({ status: z.literal("queued"), ...answer, retryAt: z.iso.datetime().nullable() }),
]);

export type ParseResponse = z.output<typeof ParseResponseSchema>;

/** Whether the assistant can read now, or when it should again. */
export const LlmStatusSchema = z.strictObject({
  available: z.boolean(),
  retryAt: z.iso.datetime().nullable(),
});
