import type { SyncEvent } from "@pace/core";

export type { Observation, SyncEvent } from "@pace/core";

/**
 * A JSON value as read back from storage. Deliberately not recursive: the Durable Object
 * RPC types (`Rpc.Serializable`) cannot expand a recursive alias.
 */
export type JsonValue = boolean | null | number | object | string;

/** An event as read back from the log: the payload is known to be JSON (it was stored as such). */
export type StoredEvent = Omit<SyncEvent, "payload"> & { readonly payload: JsonValue };
