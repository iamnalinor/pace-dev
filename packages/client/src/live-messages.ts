import { type LiveServerMessage, LiveServerMessageSchema } from "@pace/core";

import type { LiveEventsPage } from "./live-types.ts";

/** Where the server's log stood as the socket opened (a v2 hello from this build on). */
export type LogHead = { readonly seq: number; readonly storeId: string };

export type LiveHandlers = {
  readonly open: () => void;
  readonly hello: (head: LogHead | null) => void;
  readonly changed: () => void;
  readonly answer: (message: LiveServerMessage) => boolean;
  readonly invalid: (id: string) => void;
  readonly events?: ((page: LiveEventsPage) => void) | undefined;
  readonly message?: ((message: unknown) => void) | undefined;
  readonly close: (code: unknown) => void;
  readonly pong: () => void;
};

const SYNC_TYPES = new Set(["changed", "error", "events", "hello", "pushed"] as const);

type SyncMessage = Extract<
  LiveServerMessage,
  { type: typeof SYNC_TYPES extends Set<infer T> ? T : never }
>;

/** The types that answer a request by its id. */
const ANSWER_TYPES: ReadonlySet<unknown> = new Set(["error", "events", "pushed"]);

const isAnswerType = (type: unknown): boolean => ANSWER_TYPES.has(type);

const isSyncMessage = (message: LiveServerMessage): message is SyncMessage =>
  (SYNC_TYPES as ReadonlySet<string>).has(message.type);

/** A message of the sync protocol: the server speaks v2, the log grew, an answer, new events. */
const onSyncMessage = (message: SyncMessage, on: LiveHandlers): void => {
  switch (message.type) {
    case "hello": {
      const { seq, storeId } = message;
      on.hello(seq === undefined || storeId === undefined ? null : { seq, storeId });
      return;
    }
    case "changed": {
      on.changed();
      return;
    }
    case "events": {
      if (!on.answer(message)) {
        const { id: _id, type: _type, ...page } = message;
        on.events?.(page);
      }
      return;
    }
    case "error":
    case "pushed": {
      // One that answers no open request was given up on: HTTP has taken it over.
      on.answer(message);
    }
  }
};

/**
A message of a sync type that failed its schema; true when it was handled (class 373). An answer
fails its request now, not at the request's timeout. A hello still says the server speaks v2 and
is the socket's catch-up: read as one that names nothing (a pull), never as a notice, which left
the copy and v2 waiting for the poll.
*/
const wasOutOfShapeHandled = (raw: { readonly type?: unknown }, on: LiveHandlers): boolean => {
  if (isAnswerType(raw.type) && "id" in raw && typeof raw.id === "string") {
    on.invalid(raw.id);
    return true;
  }
  if (raw.type === "hello") {
    on.hello(null);
    return true;
  }
  return false;
};

/**
One message as the channel reads it: the sync protocol's own goes to `onSyncMessage` (out of
shape, to `wasOutOfShapeHandled`); a type a newer server added is passed over; the rest (the pool's
notices, also when off-contract) goes to `message` as parsed JSON, which reads it with its own
schema.
*/
export const onLiveMessage = (raw: { readonly type?: unknown }, on: LiveHandlers): void => {
  const parsed = LiveServerMessageSchema.safeParse(raw);
  if (parsed.success) {
    if (isSyncMessage(parsed.data)) {
      onSyncMessage(parsed.data, on);
    } else if (parsed.data.type !== "unknown") {
      on.message?.(raw);
    }
  } else if (!wasOutOfShapeHandled(raw, on)) {
    on.message?.(raw);
  }
};
