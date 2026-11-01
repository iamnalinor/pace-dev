import {
  type KnownLiveServerMessage,
  LIVE_BAD_REQUEST,
  LIVE_PAGE,
  parseLiveClientMessage,
  type Result,
  type STORE_CHANGED,
} from "@pace/core";

import type { AppendOptions, AppendResult } from "./event-log.ts";

/** The store calls a socket request runs: the very ones the HTTP sync routes call. */
export type LiveStoreCalls = {
  readonly push: (
    storeId: string,
    raw: readonly unknown[],
    options: AppendOptions,
  ) => Promise<Result<AppendResult, typeof STORE_CHANGED>>;
  readonly list: (
    since: number,
    limit: number,
  ) => Promise<{
    readonly events: readonly unknown[];
    readonly more: boolean;
    readonly seq: number;
    readonly storeId: string;
  }>;
};

/**
The id of a request the server could not read, when one is there to read: the client then fails
that request at once instead of waiting for its timeout. Otherwise empty.
*/
const requestIdOf = (data: string): string => {
  try {
    const json: unknown = JSON.parse(data);
    const id: unknown =
      typeof json === "object" && json !== null ? (json as { readonly id?: unknown }).id : null;
    return typeof id === "string" && id.length <= 64 ? id : "";
  } catch {
    return "";
  }
};

/**
The answer to one message of a v2 socket: a push runs the store's `push` (one copy of a known id,
the whole batch refused for another store) and answers `pushed` or `error`; a pull runs `list`
and answers its page as `events`. What cannot be read is `bad-request`; the socket stays open.
*/
export const answerLiveMessage = async (
  store: LiveStoreCalls,
  data: ArrayBuffer | string,
  now: string,
): Promise<KnownLiveServerMessage> => {
  if (typeof data !== "string") {
    // Requests are JSON text; a binary frame has nothing to read.
    return { code: LIVE_BAD_REQUEST, id: "", type: "error" };
  }
  const parsed = parseLiveClientMessage(data);
  if (!parsed.ok) {
    return { code: parsed.error, id: requestIdOf(data), type: "error" };
  }
  const message = parsed.value;
  switch (message.type) {
    case "push": {
      const result = await store.push(message.storeId, message.events, { now });
      if (!result.ok) {
        return { code: result.error, id: message.id, type: "error" };
      }
      const { accepted, rejected, seq } = result.value;
      return {
        accepted: [...accepted],
        id: message.id,
        rejected: [...rejected],
        seq,
        type: "pushed",
      };
    }
    case "pull": {
      const page = await store.list(message.since, message.limit ?? LIVE_PAGE);
      return {
        events: [...page.events],
        id: message.id,
        more: page.more,
        seq: page.seq,
        since: message.since,
        storeId: page.storeId,
        type: "events",
      };
    }
  }
};
