import type { Result } from "@pace/core";

import type { ApiClient } from "./api-client.ts";
import type { LocalSnapshot } from "./checkpoint-store-types.ts";
import type { Sha256Text } from "./checkpoint-validation.ts";
import type { EventStore } from "./event-store.ts";
import type { HistoryCoordinator } from "./history-types.ts";
import type { AppStateHandle } from "./state.ts";
import type { SyncTransport } from "./sync-transport.ts";

export type CheckpointSyncOptions = {
  readonly api: ApiClient;
  readonly state: AppStateHandle;
  readonly store: EventStore;
  readonly transport: SyncTransport;
  readonly history: HistoryCoordinator;
  readonly hash?: Sha256Text;
  readonly pullSource?: SyncTransport["pull"];
};
export type CheckpointSyncContext = CheckpointSyncOptions & {
  readonly hash: Sha256Text;
  readonly pullSource: SyncTransport["pull"];
  readonly runtime: {
    initialized: boolean;
    sourceStore: null | string;
    isClosed: boolean;
    negotiated: Promise<boolean> | undefined;
  };
};
export const assertLive = (context: CheckpointSyncContext): void => {
  if (context.runtime.isClosed) {
    throw new Error("sync/copy-changed");
  }
};
export const assertOwner = (context: CheckpointSyncContext, snapshot: LocalSnapshot): void => {
  if (context.state.localCopy()?.owner !== snapshot.owner) {
    throw new Error("sync/copy-changed");
  }
};

export const requireValue = <T, E extends string>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};
export const assertRequestCopy = (context: CheckpointSyncContext, copy: number): void => {
  assertLive(context);
  if (context.state.copy() !== copy) {
    throw new Error("sync/copy-changed");
  }
};
export const readOwnedSnapshot = async (context: CheckpointSyncContext): Promise<LocalSnapshot> => {
  const snapshot = await context.store.readSnapshot();
  assertOwner(context, snapshot);
  return snapshot;
};
