import { CHECKPOINT_VERSION, endpoints } from "@pace/core";

import type { CopyMeta } from "./checkpoint-store-types.ts";
import type { CheckpointSync, SyncRun } from "./sync-types.ts";

import { ApiError } from "./api-client.ts";
import { bootstrapCheckpoint } from "./checkpoint-sync-bootstrap.ts";
import { pullCheckpointPages, shouldPullForCheckpointPage } from "./checkpoint-sync-pages.ts";
import {
  assertLive,
  type CheckpointSyncContext,
  type CheckpointSyncOptions,
  readOwnedMeta,
} from "./checkpoint-sync-types.ts";
import { sha256Text } from "./checkpoint-validation.ts";
import {
  HISTORY_INCOMPLETE,
  INVALID_RESPONSE,
  REPEATED_BOOTSTRAP,
  SOURCE_UNREADABLE,
  SyncError,
} from "./sync-error.ts";
import { type Pushed, pushOutbox } from "./sync-push.ts";
import { SYNC_SCHEMA_VERSION } from "./sync-version.ts";

export type { CheckpointSync } from "./sync-types.ts";

const isCheckpointCapable = async (context: CheckpointSyncContext): Promise<boolean> => {
  const instance = await (context.instance?.latest() ?? context.api.call(endpoints.instance, {}));
  return instance.features.historyCheckpoint === CHECKPOINT_VERSION;
};
const isOffered = async (context: CheckpointSyncContext): Promise<boolean> => {
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
/** The SyncError codes a server that no longer speaks this checkpoint contract answers with. */
const CONTRACT_CODES: ReadonlySet<string> = new Set([
  HISTORY_INCOMPLETE,
  INVALID_RESPONSE,
  REPEATED_BOOTSTRAP,
]);
/** HTTP answers of a server that does not know the route or its parameters (an older deploy). */
const CONTRACT_STATUSES: ReadonlySet<number> = new Set([400, 404, 410, 422]);
/**
Whether a run failed on the checkpoint contract itself: a page or a checkpoint out of shape, or a
route the server does not know. The server may have been rolled back or its version raised.
*/
const isContractError = (error: unknown): boolean => {
  if (error instanceof ApiError) {
    return CONTRACT_STATUSES.has(error.status);
  }
  if (error instanceof SyncError) {
    const { code }: { readonly code: string } = error as SyncError;
    // A source this build cannot read is the log's, not the contract's (`sync-run.ts` takes it).
    return (
      CONTRACT_CODES.has(code) || (code.startsWith("checkpoint/") && code !== SOURCE_UNREADABLE)
    );
  }
  return error instanceof Error && error.name === "ZodError";
};
/**
A copy that has pulled nothing yet starts from the checkpoint, and one built on a checkpoint
follows it. A full copy that has pulled (one made before checkpoints, or one whose history was
loaded) holds more than a checkpoint would leave it: it keeps pulling its tail the legacy way.
"Has pulled" is the store id, never the cursor: a schema upgrade rewinds the cursor to 0 and may be
cut off before its pull (bug-lessons 363).
*/
const hasPulled = (meta: CopyMeta): boolean => meta.storeId !== null;
const isCheckpointRun = (meta: CopyMeta): boolean =>
  meta.coverage === "checkpoint" || !hasPulled(meta);
/**
Whether the copy needs the server's checkpoint before its tail: it has none yet, its stored base
cannot be read by this build (the state holds none), or it was pulled under an older sync schema
(events skipped then come with the new base).
*/
const requiresBootstrap = (context: CheckpointSyncContext, meta: CopyMeta): boolean =>
  meta.coverage === "full"
    ? !hasPulled(meta)
    : context.state.store.getState().checkpoint === null || meta.syncVersion < SYNC_SCHEMA_VERSION;
const initialize = async (context: CheckpointSyncContext, meta: CopyMeta): Promise<number> => {
  const { runtime } = context;
  if (runtime.initialized) {
    return 0;
  }
  const pulled = requiresBootstrap(context, meta) ? await bootstrapCheckpoint(context) : 0;
  runtime.initialized = true;
  return pulled;
};
const afterPush = async (
  context: CheckpointSyncContext,
  push: Pushed,
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
const run = async (context: CheckpointSyncContext): Promise<SyncRun> => {
  await context.state.ready;
  assertLive(context);
  const meta = await readOwnedMeta(context);
  if (context.state.localCopy()?.copyToken !== meta.copyToken) {
    await context.state.rematerialize();
  }
  const initial = await initialize(context, meta);
  const pulled = initial + (await pullCheckpointPages(context));
  const pushed = await pushOutbox({
    ...context,
    assertLive: () => {
      assertLive(context);
    },
  });
  const after = await afterPush(context, pushed);
  return {
    summary: { pulled: (after.didReset ? 0 : pulled) + after.pulled, pushed: pushed.pushed },
    rejected: pushed.rejected,
  };
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
    enabled: async () =>
      (await isOffered(context)) && isCheckpointRun(await context.store.readMeta()),
    run: async () => {
      try {
        return await run(context);
      } catch (error) {
        // Asked again at the next run: a long-lived tab follows a rollback or a version bump
        // without a reload (bug-lessons 362).
        if (isContractError(error)) {
          context.runtime.negotiated = undefined;
        }
        throw error;
      }
    },
    ingestLive: async (page) => await shouldPullForCheckpointPage(context, page),
    close: () => {
      context.runtime.isClosed = true;
      context.runtime.negotiated = undefined;
    },
  };
};
