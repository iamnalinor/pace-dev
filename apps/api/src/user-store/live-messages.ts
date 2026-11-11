import {
  type KnownLiveServerMessage,
  LIVE_BAD_REQUEST,
  LIVE_PAGE,
  type LiveClientMessage,
  ok,
  parseLiveClientMessage,
  type Result,
  type STORE_CHANGED,
} from "@pace/core";

import type {
  HistoryPullError,
  HistoryPullInput,
  StoredSyncRecord,
} from "../shared/history-sync-types.ts";
import type { AppendOptions, AppendResult } from "./event-log.ts";

type LivePage = {
  readonly events: readonly unknown[];
  readonly records?: readonly StoredSyncRecord[];
  readonly bootstrapRequired?: boolean;
  readonly more: boolean;
  readonly seq: number;
  readonly storeId: string;
};

/** The store calls a socket request runs: the very ones the HTTP sync routes call. */
export type LiveStoreCalls = {
  readonly pull?: (input: HistoryPullInput) => Promise<Result<LivePage, HistoryPullError>>;
  readonly push: (
    storeId: string,
    raw: readonly unknown[],
    options: AppendOptions,
  ) => Promise<Result<AppendResult, typeof STORE_CHANGED>>;
  readonly list: (since: number, limit: number) => Promise<LivePage>;
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

type PushMessage = Extract<LiveClientMessage, { type: "push" }>;
type PullMessage = Extract<LiveClientMessage, { type: "pull" }>;
const answerPush = async (
  store: LiveStoreCalls,
  message: PushMessage,
  now: string,
): Promise<KnownLiveServerMessage> => {
  const result = await store.push(message.storeId, message.events, { now });
  if (!result.ok) {
    return { code: result.error, id: message.id, type: "error" };
  }
  return {
    accepted: [...result.value.accepted],
    rejected: [...result.value.rejected],
    id: message.id,
    seq: result.value.seq,
    type: "pushed",
  };
};
const pullPage = async (
  store: LiveStoreCalls,
  message: PullMessage,
): Promise<Result<LivePage, HistoryPullError>> => {
  if (store.pull === undefined) {
    return ok(await store.list(message.since, message.limit ?? LIVE_PAGE));
  }
  return await store.pull({
    since: message.since,
    limit: message.limit ?? LIVE_PAGE,
    ...(message.storeId !== undefined && { storeId: message.storeId }),
    ...(message.through !== undefined && { through: message.through }),
    ...(message.checkpointVersion !== undefined && {
      checkpointVersion: message.checkpointVersion,
    }),
  });
};
const answerPull = async (
  store: LiveStoreCalls,
  message: PullMessage,
): Promise<KnownLiveServerMessage> => {
  const result = await pullPage(store, message);
  if (!result.ok) {
    return { code: result.error, id: message.id, type: "error" };
  }
  const page = result.value;
  return {
    events: [...page.events],
    ...(page.records !== undefined && { records: [...page.records] }),
    ...(page.bootstrapRequired !== undefined && { bootstrapRequired: page.bootstrapRequired }),
    id: message.id,
    more: page.more,
    seq: page.seq,
    since: message.since,
    storeId: page.storeId,
    type: "events",
  };
};

/** Both transports call the same generation-bound source methods. */
export const answerLiveMessage = async (
  store: LiveStoreCalls,
  data: ArrayBuffer | string,
  now: string,
): Promise<KnownLiveServerMessage> => {
  if (typeof data !== "string") {
    return { code: LIVE_BAD_REQUEST, id: "", type: "error" };
  }
  const parsed = parseLiveClientMessage(data);
  if (!parsed.ok) {
    return { code: parsed.error, id: requestIdOf(data), type: "error" };
  }
  const message = parsed.value;
  switch (message.type) {
    case "push": {
      return await answerPush(store, message, now);
    }
    case "pull": {
      return await answerPull(store, message);
    }
  }
};
