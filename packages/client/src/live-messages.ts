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
One message as the channel reads it: the sync protocol's own goes to `onSyncMessage`; a type a
newer server added is passed over; the rest (the pool's notices, also when off-contract) goes
to `message` as parsed JSON, which reads it with its own schema.
*/
export const onLiveMessage = (raw: { readonly type?: unknown }, on: LiveHandlers): void => {
  const parsed = LiveServerMessageSchema.safeParse(raw);
  if (parsed.success && isSyncMessage(parsed.data)) {
    onSyncMessage(parsed.data, on);
  } else if (!parsed.success || parsed.data.type !== "unknown") {
    if (!parsed.success && raw.type === "events" && "id" in raw && typeof raw.id === "string") {
      on.invalid(raw.id);
      return;
    }
    on.message?.(raw);
  }
};
