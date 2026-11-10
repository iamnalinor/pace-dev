import type { ApiClient } from "./api-client.ts";
import type { PaceClientOptions } from "./create-client-types.ts";
import type { HistoryCoordinator } from "./history-types.ts";
import type { InstanceReader } from "./instance.ts";

import { createCheckpointSync } from "./checkpoint-sync.ts";
import { createHistoryCoordinator } from "./history.ts";
import { parseStoreChange } from "./peer-tabs.ts";
import { type AppStateHandle, createAppState } from "./state.ts";
import { createSyncClient, type SyncClient } from "./sync-client.ts";
import { httpTransport, type SyncTransport } from "./sync-transport.ts";

type StateAndSyncDeps = {
  readonly now: () => string;
  readonly api: ApiClient;
  /** The server's instance, shared with the app's server check. */
  readonly instance: InstanceReader;
  /** See `SyncDeps.onCopyChanged`. */
  readonly onCopyChanged: () => void;
};

/**
The local state and its sync: a local change is sent within a second, over the live socket while
it can carry it and over HTTP otherwise (decided per call, see `sync-transport.ts`).
*/
export const stateAndSync = (
  options: PaceClientOptions,
  transport: SyncTransport,
  deps: StateAndSyncDeps,
): {
  readonly state: AppStateHandle;
  readonly sync: SyncClient;
  readonly closePeers: () => void;
  readonly history: HistoryCoordinator;
} => {
  const { now, api } = deps;
  // The sync is wired after the state it reads, so the state reaches it through this.
  const wiring = { sendSoon: (): void => undefined };
  const state = createAppState({
    deviceId: options.deviceId,
    now,
    onLocal: () => {
      wiring.sendSoon();
    },
    ...(options.peers !== undefined && { onStored: options.peers.post }),
    source: options.source,
    store: options.store,
  });
  const stopListening = options.peers?.listen((message) => {
    const change = parseStoreChange(message);
    if (change !== null) {
      void state.adoptPeerChange(change);
    }
  });
  const history = createHistoryCoordinator({
    store: options.store,
    state,
    pull: httpTransport(api).pull,
  });
  const checkpointSync = createCheckpointSync({
    api,
    state,
    store: options.store,
    transport,
    history,
    instance: deps.instance,
    pullSource: httpTransport(api).pull,
    ...(options.sha256Text !== undefined && { hash: options.sha256Text }),
  });
  const sync = createSyncClient({
    checkpointSync,
    now,
    onCopyChanged: deps.onCopyChanged,
    state,
    store: options.store,
    transport,
  });
  wiring.sendSoon = sync.soon;
  const closePeers = (): void => {
    history.close();
    checkpointSync.close();
    stopListening?.();
    options.peers?.close();
  };
  return { closePeers, state, sync, history };
};
