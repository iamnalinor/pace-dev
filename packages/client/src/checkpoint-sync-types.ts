import type { ApiClient } from "./api-client.ts";
import type { CopyMeta, LocalSnapshot } from "./checkpoint-store-types.ts";
import type { Sha256Text } from "./checkpoint-validation.ts";
import type { EventStore } from "./event-store.ts";
import type { HistoryCoordinator } from "./history-types.ts";
import type { AppStateHandle } from "./state.ts";
import type { SyncTransport } from "./sync-transport.ts";

import { COPY_CHANGED, SyncError } from "./sync-error.ts";

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
    throw new SyncError(COPY_CHANGED);
  }
};
export const assertOwner = (
  context: CheckpointSyncContext,
  snapshot: Pick<LocalSnapshot, "owner">,
): void => {
  if (context.state.localCopy()?.owner !== snapshot.owner) {
    throw new SyncError(COPY_CHANGED);
  }
};

export const assertRequestCopy = (context: CheckpointSyncContext, copy: number): void => {
  assertLive(context);
  if (context.state.copy() !== copy) {
    throw new SyncError(COPY_CHANGED);
  }
};
/** The copy's meta, once it is known to be this session's: what a page or a bootstrap is guarded by. */
export const readOwnedMeta = async (context: CheckpointSyncContext): Promise<CopyMeta> => {
  const meta = await context.store.readMeta();
  assertOwner(context, meta);
  return meta;
};
