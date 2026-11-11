import type { EventStore } from "./event-store.ts";
import type { AppStateHandle } from "./state.ts";
import type { PullPage, SyncTransport } from "./sync-transport.ts";

export type SyncStatus = {
  /** False after a transport failure (no network), true again after any response. */
  readonly online: boolean;
  readonly syncing: boolean;
  readonly lastError: null | string;
  readonly lastSyncAt: null | string;
};

export type SyncSummary = { readonly pulled: number; readonly pushed: number };

/** How many events one pull asks for, and one push carries. */
export const SYNC_PAGE = 200;

/** What a run did, and what the server refused of the outbox (`<id> (<reason>)`). */
export type SyncRun = { readonly summary: SyncSummary; readonly rejected: readonly string[] };

export type CheckpointSync = {
  /**
  Whether this copy syncs from a checkpoint: the server offers one, and the copy is either built
  on one or has pulled nothing yet. A full copy that has pulled keeps the legacy run, so it is
  never bootstrapped again or cut down to a checkpoint (PR 55 review I2).
  */
  readonly enabled: () => Promise<boolean>;
  readonly run: () => Promise<SyncRun>;
  readonly ingestLive: (page: PullPage) => Promise<boolean>;
  readonly close: () => void;
};

export type SyncDeps = {
  readonly checkpointSync?: CheckpointSync;
  /**
  A run refused to touch a local copy that is no longer this session's (`COPY_CHANGED`): it sent
  nothing, so no answer of the server can say whether the session still stands. The client asks.
  */
  readonly onCopyChanged?: () => void;
  readonly transport: SyncTransport;
  readonly now: () => string;
  readonly state: AppStateHandle;
  readonly store: EventStore;
};
