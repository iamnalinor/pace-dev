import { z } from "zod";

import { LiveNoticeSchema } from "../notify/pool.ts";
import { err, ok, type Result } from "../result.ts";
import { loosen } from "./loose.ts";
import { StoreIdSchema, SyncPushBodySchema, SyncPushOutputSchema } from "./schemas/sync.ts";

/*
The live socket (`GET /api/sync/live`). `pace.v1` only says `changed` and the pool's notices;
`pace.v2` (offered first by newer apps) carries the sync hot path too: the client pushes over it,
the server sends new events as they land and answers a catch-up pull. Everything else stays HTTP,
and HTTP stays the fallback whenever the socket is down or slow. v2 is additive: the API
`PROTOCOL` does not change for it, and a client offering only v1 is served as before.
*/

/** The first subprotocol: `changed` and the pool's notices only. */
export const LIVE_V1 = "pace.v1";

/** The sync subprotocol: push, proactive events and pull over the socket. */
export const LIVE_V2 = "pace.v2";

/**
The most events one `events` message carries: a bigger append is announced empty with `more`,
and the client pulls it in pages. Also a pull's page when it names no limit (as HTTP's default).
*/
export const LIVE_PAGE = 200;

/** How long a client waits for the answer to a socket request before it falls back to HTTP. */
export const LIVE_REQUEST_TIMEOUT_MS = 10_000;

/** How many socket requests a client keeps unanswered at once. */
export const LIVE_MAX_IN_FLIGHT = 4;

/**
The close code of a live socket whose session ended (revoked, logged out, "Not me", expired): the
app checks its session (a 401 signs it out) instead of reconnecting. 4000-4999 are the
application's own codes (RFC 6455 §7.4.2); 4401 reads as "unauthorized".
*/
export const LIVE_SESSION_ENDED = 4401;

/** The one error code of a socket message the server cannot read. */
export const LIVE_BAD_REQUEST = "bad-request";

/** A client's name for one request, echoed in its answer. */
const RequestIdSchema = z.string().min(1).max(64);

/**
What a v2 client sends: a push (the HTTP push body itself, under a request id) or a catch-up
pull. Strict, as every input: a key the server does not know refuses the message.
*/
export const LiveClientMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("push"),
    id: RequestIdSchema,
    ...SyncPushBodySchema.shape,
  }),
  z.strictObject({
    type: z.literal("pull"),
    id: RequestIdSchema,
    since: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
]);

export type LiveClientMessage = z.output<typeof LiveClientMessageSchema>;

/** Text as JSON; `undefined` (never a JSON value) when it is not JSON. */
const jsonOf = (data: string): unknown => {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
};

/** A socket message as a request: invalid JSON, an unknown type or a bad field is `bad-request`. */
export const parseLiveClientMessage = (
  data: string,
): Result<LiveClientMessage, typeof LIVE_BAD_REQUEST> => {
  const parsed = LiveClientMessageSchema.safeParse(jsonOf(data));
  return parsed.success ? ok(parsed.data) : err(LIVE_BAD_REQUEST);
};

const SyncMessages = [
  /** The first message on a v2 socket: the server speaks it. */
  z.object({ type: z.literal("hello"), protocol: z.string() }),
  /** A push's answer: the HTTP push answer under the request's id. */
  SyncPushOutputSchema.extend({ type: z.literal("pushed"), id: z.string() }),
  /**
  Events after `since` up to `seq`: sent unasked after an append (no `id`), or as a pull's page
  (its `id`). `more` with no events: the append was too big to carry, pull it.
  */
  z.object({
    type: z.literal("events"),
    id: z.string().optional(),
    since: z.number().int().nonnegative(),
    seq: z.number().int().nonnegative(),
    storeId: StoreIdSchema,
    events: z.array(z.unknown()),
    more: z.boolean(),
  }),
  /** A request refused: `store/changed`, `bad-request` (with the id when one was readable). */
  z.object({ type: z.literal("error"), id: z.string(), code: z.string() }),
  /** v1's "the log grew to `seq`". */
  z.object({ type: z.literal("changed"), seq: z.number().int().nonnegative() }),
] as const;

const KnownServerMessageSchema = z.discriminatedUnion("type", [
  ...SyncMessages,
  ...LiveNoticeSchema.options,
]);

/** What the server sends on the live socket, as it writes it. */
export type KnownLiveServerMessage = z.input<typeof KnownServerMessageSchema>;

const KNOWN_TYPES: ReadonlySet<string> = new Set(
  KnownServerMessageSchema.options.map((option) => option.shape.type.value),
);

/** A type a newer server added: read as `unknown`, which a client passes over. */
const UnknownServerMessageSchema = z
  .object({ type: z.string().refine((type) => !KNOWN_TYPES.has(type)) })
  .transform(({ type }) => ({ received: type, type: "unknown" as const }));

/**
What the server says on the live socket, read as an answer: loosened (a key a newer server adds
is dropped) and with an unknown `type` tolerated. A known message that is off-contract still
fails, so tests that parse every message through this catch a server that drifts (class 12).
*/
export const LiveServerMessageSchema = loosen(
  z.union([KnownServerMessageSchema, UnknownServerMessageSchema]),
);

export type LiveServerMessage = z.output<typeof LiveServerMessageSchema>;
