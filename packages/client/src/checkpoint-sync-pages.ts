import { CHECKPOINT_VERSION, type SequencedCheckpointEvent, STORE_CHANGED } from "@pace/core";

import type { CopyMeta } from "./checkpoint-store-types.ts";
import type { PullPage } from "./sync-transport.ts";

import { ApiError } from "./api-client.ts";
import { isSameCopy } from "./checkpoint-store.ts";
import { bootstrapCheckpoint } from "./checkpoint-sync-bootstrap.ts";
import { assertLive, type CheckpointSyncContext, readOwnedMeta } from "./checkpoint-sync-types.ts";
import { readTailRecords } from "./checkpoint-validation.ts";
import {
  COPY_CHANGED,
  HISTORY_INCOMPLETE,
  REBUILD_REQUIRED,
  REPEATED_BOOTSTRAP,
  SyncError,
  valueOrThrow,
} from "./sync-error.ts";
import { SYNC_PAGE } from "./sync-types.ts";

type PageInput = {
  readonly page: PullPage;
  readonly guard: CopyMeta;
  readonly records: readonly SequencedCheckpointEvent[];
};
const commitPage = async (context: CheckpointSyncContext, input: PageInput) =>
  await context.state.commitSnapshot(async () => {
    assertLive(context);
    return await context.store.applyRemotePage({
      guard: input.guard,
      storeId: input.page.storeId,
      since: input.page.since,
      seq: input.page.seq,
      records: input.records,
    });
  });
const retryPage = async (context: CheckpointSyncContext, input: PageInput) => {
  valueOrThrow(await context.history.ensureComplete());
  const guard = await context.store.readMeta();
  if (!isSameCopy(guard, input.guard)) {
    throw new SyncError(COPY_CHANGED);
  }
  return await commitPage(context, { ...input, guard });
};
/**
Installs one page of the tail. An event this build cannot read is left out and the cursor moves
past it, as the legacy pull does (`readTailRecords`); a page that breaks the contract fails.
*/
export const applyCheckpointPage = async (
  context: CheckpointSyncContext,
  page: PullPage,
  captured: CopyMeta,
): Promise<number> => {
  assertLive(context);
  if (page.records === undefined) {
    throw new SyncError(HISTORY_INCOMPLETE);
  }
  const records = valueOrThrow(readTailRecords(page.records, page));
  let installed = await commitPage(context, { page, guard: captured, records });
  if (!installed.ok && installed.error === REBUILD_REQUIRED && captured.coverage === "checkpoint") {
    installed = await retryPage(context, { page, guard: captured, records });
  }
  valueOrThrow(installed);
  await context.state.rematerialize();
  return records.length;
};
const requestPage = async (
  context: CheckpointSyncContext,
  current: CopyMeta,
): Promise<"bootstrap" | PullPage> => {
  const generation = context.runtime.sourceStore ?? current.storeId;
  const since =
    context.runtime.sourceStore === null || generation === current.storeId ? current.cursor : 0;
  try {
    const page = await context.transport.pull(since, SYNC_PAGE, {
      checkpointVersion: CHECKPOINT_VERSION,
      ...(generation !== null && { storeId: generation }),
    });
    assertLive(context);
    return page;
  } catch (error) {
    if (error instanceof ApiError && error.code === STORE_CHANGED) {
      return "bootstrap";
    }
    throw error;
  }
};
const assertPageProgress = (page: PullPage): void => {
  if (page.more && page.seq <= page.since) {
    throw new SyncError(HISTORY_INCOMPLETE);
  }
};

export const pullCheckpointPages = async (context: CheckpointSyncContext): Promise<number> => {
  let count = 0;
  let isDemanded = false;
  for (;;) {
    const current = await readOwnedMeta(context);
    const page = await requestPage(context, current);
    if (page === "bootstrap" || page.bootstrapRequired === true) {
      if (isDemanded) {
        throw new SyncError(REPEATED_BOOTSTRAP);
      }
      isDemanded = true;
      count += await bootstrapCheckpoint(context);
      continue;
    }
    assertPageProgress(page);
    count += await applyCheckpointPage(context, page, current);
    if (!page.more) {
      return count;
    }
  }
};
export const shouldPullForCheckpointPage = async (
  context: CheckpointSyncContext,
  page: PullPage,
): Promise<boolean> => {
  if (page.bootstrapRequired === true) {
    return true;
  }
  const current = await context.store.readMeta();
  if (context.state.localCopy()?.owner !== current.owner) {
    return true;
  }
  if (page.storeId !== current.storeId || page.more || page.since !== current.cursor) {
    return page.seq > current.cursor || page.storeId !== current.storeId;
  }
  await applyCheckpointPage(context, page, current);
  return false;
};
