import { z } from "zod";

import { ParseQuestionSchema } from "../../parse/schema.ts";
import { ParseDomainSchema } from "../../proposals/kinds.ts";
import { ProposalSchema } from "../../proposals/schema.ts";

/**
The field a message was typed into: the task line, the activity line, or `auto` (the bot's one
field): then the assistant says which it is and how sure it is.
*/
export const REQUEST_DOMAINS = ["task", "activity", "auto"] as const;

export type RequestDomain = (typeof REQUEST_DOMAINS)[number];

export const ParseRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  domain: z.enum(REQUEST_DOMAINS).default("task"),
  /** When no model can answer now: keep the text and read it (and write it) once one can. */
  defer: z.boolean().optional(),
  /** A reading while the person is still typing: answered, but kept out of the decision log. */
  draft: z.boolean().optional(),
});

export type ParseRequest = z.input<typeof ParseRequestSchema>;

/** A request as the server reads it, the field filled in. */
export type ParseRequestBody = z.output<typeof ParseRequestSchema>;

/** Questions as the client reads them: a newer server may add keys (the model's own stay strict). */
const AnsweredQuestionSchema = z.object(ParseQuestionSchema.shape);

const answer = {
  /** What the message is about: the field it came from, or the assistant's (or rules') reading. */
  domain: ParseDomainSchema,
  /** How sure that reading is, 0..1: 1 when the field said so. */
  confidence: z.number().min(0).max(1),
  /** What to do, each with its summary; nothing is written until the person accepts one. */
  proposals: z.array(ProposalSchema),
  /** What the assistant asks about what stays ambiguous, in the interface language. */
  questions: z.array(AnsweredQuestionSchema).optional(),
};

/**
Read by the client, so loose: keys a newer server adds are dropped, not refused.
The assistant's proposals for a message, checked against it (`parsed`); or, when no model can
answer right now, the rules' proposals and when one should be back (`unavailable`), or the news
that the text waits to be read and written then (`queued`, asked with `defer`).
*/
export const ParseResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("parsed"), ...answer, provider: z.string() }),
  z.object({
    status: z.literal("unavailable"),
    ...answer,
    retryAt: z.iso.datetime().nullable(),
  }),
  z.object({ status: z.literal("queued"), ...answer, retryAt: z.iso.datetime().nullable() }),
]);

export type ParseResponse = z.output<typeof ParseResponseSchema>;

/** Whether the assistant can read now, or when it should again. */
export const LlmStatusSchema = z.object({
  available: z.boolean(),
  retryAt: z.iso.datetime().nullable(),
});
