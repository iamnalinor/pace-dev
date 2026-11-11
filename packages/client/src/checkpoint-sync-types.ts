import type { Result } from "@pace/core";

import type { ApiClient } from "./api-client.ts";
import type { CopyMeta, LocalSnapshot } from "./checkpoint-store-types.ts";
import type { Sha256Text } from "./checkpoint-validation.ts";
import type { EventStore } from "./event-store.ts";
import type { HistoryCoordinator } from "./history-types.ts";
import type { InstanceReader } from "./instance.ts";
import type { AppStateHandle } from "./state.ts";
import type { SyncTransport } from "./sync-transport.ts";

import {
  COPY_CHANGED,
  HISTORY_INCOMPLETE,
  SOURCE_UNREADABLE,
  SyncError,
  valueOrThrow,
} from "./sync-error.ts";

export type CheckpointSyncOptions = {
  readonly api: ApiClient;
  /** The server's instance (shared with the app's server check); the endpoint when absent. */
  readonly instance?: InstanceReader;
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
    /** The kept instance answer failed the contract: the next negotiation asks the server. */
    isStale: boolean;
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
/**
A strict source read the run itself asked for: an unreadable source is not the run's end but a
reason to leave the checkpoint (`SOURCE_UNREADABLE`, taken by `sync-run.ts`). Every other refusal
is thrown as it is.
*/
export const sourceOrConvert = <T, E extends string>(result: Result<T, E>): T => {
  if (!result.ok && result.error === HISTORY_INCOMPLETE) {
    throw new SyncError(SOURCE_UNREADABLE);
  }
  return valueOrThrow(result);
};
/** The copy's meta, once it is known to be this session's: what a page or a bootstrap is guarded by. */
export const readOwnedMeta = async (context: CheckpointSyncContext): Promise<CopyMeta> => {
  const meta = await context.store.readMeta();
  assertOwner(context, meta);
  return meta;
};
