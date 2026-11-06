import { type SequencedCheckpointEvent, STORE_CHANGED } from "@pace/core";

import type { LocalSnapshot } from "./checkpoint-store-types.ts";
import type { PullPage } from "./sync-transport.ts";

import { ApiError } from "./api-client.ts";
import { isSameCopy } from "./checkpoint-store.ts";
import { bootstrapCheckpoint } from "./checkpoint-sync-bootstrap.ts";
import {
  assertLive,
  type CheckpointSyncContext,
  readOwnedSnapshot,
  requireValue,
} from "./checkpoint-sync-types.ts";
import { parseSourceRecords } from "./checkpoint-validation.ts";

const commitPage = async (
  context: CheckpointSyncContext,
  input: {
    readonly page: PullPage;
    readonly guard: LocalSnapshot;
    readonly records: readonly SequencedCheckpointEvent[];
  },
) =>
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
const retryPage = async (
  context: CheckpointSyncContext,
  input: {
    readonly page: PullPage;
    readonly guard: LocalSnapshot;
    readonly records: readonly SequencedCheckpointEvent[];
  },
) => {
  requireValue(await context.history.ensureComplete());
  const guard = await context.store.readSnapshot();
  if (!isSameCopy(guard, input.guard)) {
    throw new Error("sync/copy-changed");
  }
  return await commitPage(context, { ...input, guard });
};
export const applyCheckpointPage = async (
  context: CheckpointSyncContext,
  page: PullPage,
  captured: LocalSnapshot,
): Promise<number> => {
  assertLive(context);
  if (page.records === undefined) {
    throw new Error("history/incomplete");
  }
  const records = requireValue(parseSourceRecords(page.records));
  let installed = await commitPage(context, { page, guard: captured, records });
  if (
    !installed.ok &&
    installed.error === "history/rebuild-required" &&
    captured.coverage === "checkpoint"
  ) {
    installed = await retryPage(context, { page, guard: captured, records });
  }
  requireValue(installed);
  await context.state.rematerialize();
  return records.length;
};
const requestPage = async (
  context: CheckpointSyncContext,
  current: LocalSnapshot,
): Promise<"bootstrap" | PullPage> => {
  const generation = context.runtime.sourceStore ?? current.storeId;
  const since =
    context.runtime.sourceStore === null || generation === current.storeId ? current.cursor : 0;
  try {
    const page = await context.transport.pull(since, 200, {
      checkpointVersion: 1,
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
    throw new Error("history/incomplete");
  }
};

export const pullCheckpointPages = async (context: CheckpointSyncContext): Promise<number> => {
  let count = 0;
  let isDemanded = false;
  for (;;) {
    const current = await readOwnedSnapshot(context);
    const page = await requestPage(context, current);
    if (page === "bootstrap" || page.bootstrapRequired === true) {
      if (isDemanded) {
        throw new Error("checkpoint/repeated-bootstrap");
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
  const current = await context.store.readSnapshot();
  if (context.state.localCopy()?.owner !== current.owner) {
    return true;
  }
  if (page.storeId !== current.storeId || page.more || page.since !== current.cursor) {
    return page.seq > current.cursor || page.storeId !== current.storeId;
  }
  await applyCheckpointPage(context, page, current);
  return false;
};
