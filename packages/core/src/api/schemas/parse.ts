import { z } from "zod";

import { ParseDomainSchema } from "../../actions/kinds.ts";
import { ActionSchema } from "../../actions/schema.ts";
import { ParseQuestionSchema } from "../../parse/schema.ts";
import { knownOrNull } from "../tolerant.ts";

/**
The field a message was typed into: the task line, the activity line, or `auto` (the bot's one
field): then the assistant says which it is and how sure it is.
*/
export const REQUEST_DOMAINS = ["task", "activity", "auto"] as const;

export type RequestDomain = (typeof REQUEST_DOMAINS)[number];

const ThreadTurnSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  actions: z.array(ActionSchema).max(10),
});

export const ParseRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  domain: z.enum(REQUEST_DOMAINS).default("task"),
  /** Earlier requests and the actions shown for them; the latest text asks for a full revision. */
  thread: z.array(ThreadTurnSchema).max(5).optional(),
  /** When no model can answer now: keep the text and read it (and write it) once one can. */
  defer: z.boolean().optional(),
  /** A reading while the person is still typing: answered, but kept out of the decision log. */
  draft: z.boolean().optional(),
});

export type ParseRequest = z.input<typeof ParseRequestSchema>;

/** A request as the server reads it, the field filled in. */
export type ParseRequestBody = z.output<typeof ParseRequestSchema>;

/**
Why no model read a text: providers resting with a time they are back (`limited`); none answered
and none said when (`unreachable`: down, timed out); every one answered out of shape or refused
the text for good, a content filter or a 400 (`unreadable`: asking again later reads it no
better); no model on this server (`off`). The
server keeps a text to read later (`defer`) only when `limited` or `unreachable`.
*/
export const PARSE_UNAVAILABLE_REASONS = ["limited", "unreachable", "unreadable", "off"] as const;

export type ParseUnavailableReason = (typeof PARSE_UNAVAILABLE_REASONS)[number];

const UnavailableReasonSchema = knownOrNull(z.enum(PARSE_UNAVAILABLE_REASONS));

/** Whether a text no model read now can wait on the server for one that can. */
export const canReadLater = (reason: ParseUnavailableReason): boolean =>
  reason === "limited" || reason === "unreachable";

/** Questions as the client reads them: a newer server may add keys (the model's own stay strict). */
const AnsweredQuestionSchema = z.object(ParseQuestionSchema.shape);

const answer = {
  /** What the message is about: the field it came from, or the assistant's (or rules') reading. */
  domain: ParseDomainSchema,
  /** How sure that reading is, 0..1: 1 when the field said so. */
  confidence: z.number().min(0).max(1),
  /** What to do, each with its summary; nothing is written until the person accepts one. */
  actions: z.array(ActionSchema),
  /** What the assistant asks about what stays ambiguous, in the interface language. */
  questions: z.array(AnsweredQuestionSchema).optional(),
  /**
  The same list under its old name, for apps installed before it was renamed, which require it.
  The server sends it for a release or two; clients never read it.
  */
  proposals: z.array(ActionSchema).optional(),
  /**
  The decision-log row of this reading, absent when none was written (a draft): what the
  client names when it says what became of it (`POST /api/decisions/resolve`).
  */
  decisionId: z.string().optional(),
};

/**
Read by the client, so loose: keys a newer server adds are dropped, not refused.
The assistant's actions for a message, checked against it (`parsed`); or, when no model can
answer right now, the rules' actions and when one should be back (`unavailable`), or the news
that the text waits to be read and written then (`queued`, asked with `defer`).
*/
export const ParseResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("parsed"), ...answer, provider: z.string() }),
  z.object({
    status: z.literal("unavailable"),
    ...answer,
    retryAt: z.iso.datetime().nullable(),
    /**
    Why no model read it (bug class 99); `null` from a server older than the key, or for a
    reason this client has no word for.
    */
    reason: UnavailableReasonSchema,
  }),
  z.object({ status: z.literal("queued"), ...answer, retryAt: z.iso.datetime().nullable() }),
]);

export type ParseResponse = z.output<typeof ParseResponseSchema>;

/** Whether the assistant can read now, or when it should again. */
export const LlmStatusSchema = z.object({
  available: z.boolean(),
  retryAt: z.iso.datetime().nullable(),
});
