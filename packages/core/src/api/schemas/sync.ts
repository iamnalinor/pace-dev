import { z } from "zod";

/**
The structural event envelope exchanged by clients and the Worker. The payload is
opaque here; its per-type shape is validated by the core event schema (wired into
the user store's `validateEvent` seam), not by the transport.
*/
export const SyncEventSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  occurredAt: z.iso.datetime({ offset: true }),
  recordedAt: z.iso.datetime({ offset: true }),
  deviceId: z.string().min(1).max(64),
  precision: z.enum(["exact", "approx"]),
  source: z.enum(["app", "web", "bot", "mcp", "system"]),
  payload: z.unknown(),
});

export type SyncEvent = z.output<typeof SyncEventSchema>;

/**
The identity of the user's store on the server, made anew whenever the store is wiped. A
client keeps the id its local log came from; a different one means the server's data was
reset, so the local copy and its outbox belong to nothing any more and are dropped.
*/
export const StoreIdSchema = z.string().min(1).max(64);

/** The error code (HTTP 409) of a push for a store that is not the server's current one. */
export const STORE_CHANGED = "store/changed";

export const SyncPushBodySchema = z.object({
  events: z.array(SyncEventSchema).max(500),
  /** The store the client's last pull confirmed: a push for any other store is refused whole. */
  storeId: StoreIdSchema,
});

const RejectedEventSchema = z.object({ id: z.string(), reason: z.string() });

export const SyncPushOutputSchema = z.object({
  /** Ids now present in the log (including ones that were already there). */
  accepted: z.array(z.string()),
  rejected: z.array(RejectedEventSchema),
  /** The log's latest sequence number after this push. */
  seq: z.number().int().nonnegative(),
});

export const SyncPullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const SyncPullOutputSchema = z.object({
  events: z.array(SyncEventSchema),
  /** Cursor for the next pull: the sequence number of the last event returned. */
  seq: z.number().int().nonnegative(),
  more: z.boolean(),
  storeId: StoreIdSchema,
});
