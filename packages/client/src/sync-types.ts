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

/** A run's page belonged to a local copy that was wiped while it was on its way. */
export const COPY_CHANGED = "sync/copy-changed";

export type CheckpointSync = {
  readonly enabled: () => Promise<boolean>;
  readonly run: () => Promise<SyncSummary>;
  readonly ingestLive: (page: PullPage) => Promise<boolean>;
  readonly close: () => void;
};

export type SyncDeps = {
  readonly checkpointSync?: CheckpointSync;
  readonly transport: SyncTransport;
  readonly now: () => string;
  readonly state: AppStateHandle;
  readonly store: EventStore;
};
