import { endpoints, type Event, STORE_CHANGED } from "@pace/core";

import type { LocalSnapshot } from "./checkpoint-store-types.ts";
import type { CheckpointSync, SyncSummary } from "./sync-types.ts";

import { isSameCopy } from "./checkpoint-store.ts";
import { bootstrapCheckpoint } from "./checkpoint-sync-bootstrap.ts";
import { pullCheckpointPages, shouldPullForCheckpointPage } from "./checkpoint-sync-pages.ts";
import {
  assertLive,
  assertOwner,
  type CheckpointSyncContext,
  type CheckpointSyncOptions,
} from "./checkpoint-sync-types.ts";
import { sha256Text } from "./checkpoint-validation.ts";

export type { CheckpointSync } from "./sync-types.ts";

const isCheckpointCapable = async (context: CheckpointSyncContext): Promise<boolean> => {
  const instance = await context.api.call(endpoints.instance, {});
  return instance.features.historyCheckpoint === 1;
};
const isEnabled = async (context: CheckpointSyncContext): Promise<boolean> => {
  assertLive(context);
  const { runtime } = context;
  runtime.negotiated ??= (async () => await isCheckpointCapable(context))();
  try {
    return await runtime.negotiated;
  } catch (error) {
    runtime.negotiated = undefined;
    throw error;
  }
};
const sendBatch = async (
  context: CheckpointSyncContext,
  inventory: LocalSnapshot,
  events: readonly Event[],
) => {
  const current = await context.store.readSnapshot();
  if (!isSameCopy(current, inventory)) {
    throw new Error("sync/copy-changed");
  }
  assertLive(context);
  assertOwner(context, current);
  if (current.storeId === null) {
    throw new Error(STORE_CHANGED);
  }
  const response = await context.transport.push(events, current.storeId);
  assertLive(context);
  const after = await context.store.readSnapshot();
  if (!isSameCopy(after, inventory)) {
    throw new Error("sync/copy-changed");
  }
  return response;
};
const pushPending = async (context: CheckpointSyncContext) => {
  const inventory = await context.store.readSnapshot();
  const pending = inventory.records
    .filter((record) => inventory.pendingIds.includes(record.event.id))
    .map((record) => record.event);
  let pushed = 0;
  const rejected: string[] = [];
  for (let index = 0; index < pending.length; index += 200) {
    const response = await sendBatch(context, inventory, pending.slice(index, index + 200));
    if (response === STORE_CHANGED) {
      return { pushed, rejected, isReset: true };
    }
    pushed += response.accepted.length;
    rejected.push(...response.rejected.map((item) => `${item.id} (${item.reason})`));
  }
  return { pushed, rejected, isReset: false };
};
const initialize = async (
  context: CheckpointSyncContext,
  snapshot: LocalSnapshot,
): Promise<number> => {
  const { runtime } = context;
  if (runtime.initialized) {
    return 0;
  }
  const pulled =
    snapshot.coverage !== "checkpoint" || snapshot.checkpoint === null || snapshot.syncVersion < 2
      ? await bootstrapCheckpoint(context)
      : 0;
  runtime.initialized = true;
  return pulled;
};
const afterPush = async (
  context: CheckpointSyncContext,
  push: Awaited<ReturnType<typeof pushPending>>,
): Promise<{ readonly pulled: number; readonly didReset: boolean }> => {
  const { runtime } = context;
  if (push.isReset) {
    runtime.initialized = false;
    return {
      pulled: (await bootstrapCheckpoint(context)) + (await pullCheckpointPages(context)),
      didReset: true,
    };
  }
  return { pulled: push.pushed > 0 ? await pullCheckpointPages(context) : 0, didReset: false };
};
const run = async (context: CheckpointSyncContext): Promise<SyncSummary> => {
  await context.state.ready;
  assertLive(context);
  const snapshot = await context.store.readSnapshot();
  assertOwner(context, snapshot);
  if (context.state.localCopy()?.copyToken !== snapshot.copyToken) {
    await context.state.rematerialize();
  }
  const initial = await initialize(context, snapshot);
  const pulled = initial + (await pullCheckpointPages(context));
  const pushed = await pushPending(context);
  const after = await afterPush(context, pushed);
  if (pushed.rejected.length > 0) {
    throw new Error(`push rejected: ${pushed.rejected.join(", ")}`);
  }
  return { pulled: (after.didReset ? 0 : pulled) + after.pulled, pushed: pushed.pushed };
};
/** One runtime owns negotiation; failed discovery follows normal sync backoff. */
export const createCheckpointSync = (options: CheckpointSyncOptions): CheckpointSync => {
  const context: CheckpointSyncContext = {
    ...options,
    hash: options.hash ?? sha256Text,
    pullSource: options.pullSource ?? options.transport.pull,
    runtime: { initialized: false, sourceStore: null, isClosed: false, negotiated: undefined },
  };
  return {
    enabled: async () => await isEnabled(context),
    run: async () => await run(context),
    ingestLive: async (page) =>
      (await isEnabled(context)) ? await shouldPullForCheckpointPage(context, page) : true,
    close: () => {
      context.runtime.isClosed = true;
      context.runtime.negotiated = undefined;
    },
  };
};
