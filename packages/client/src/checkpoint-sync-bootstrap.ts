import { type EndpointOutput, endpoints } from "@pace/core";

import type { CopyMeta, ValidatedCheckpoint } from "./checkpoint-store-types.ts";

import { isSameCopy } from "./checkpoint-store.ts";
import {
  assertLive,
  assertRequestCopy,
  type CheckpointSyncContext,
  readOwnedMeta,
} from "./checkpoint-sync-types.ts";
import { readTailRecords, validateCheckpoint } from "./checkpoint-validation.ts";
import { readCompleteSource } from "./history-source.ts";
import {
  COPY_CHANGED,
  HISTORY_INCOMPLETE,
  REBUILD_REQUIRED,
  SyncError,
  valueOrThrow,
} from "./sync-error.ts";
import { SYNC_PAGE } from "./sync-types.ts";
import { SYNC_SCHEMA_VERSION } from "./sync-version.ts";

const readSameCopy = async (context: CheckpointSyncContext, guard: CopyMeta): Promise<CopyMeta> => {
  const current = await context.store.readMeta();
  if (!isSameCopy(current, guard)) {
    throw new SyncError(COPY_CHANGED);
  }
  return current;
};
type Answer = Extract<EndpointOutput<typeof endpoints.sync.bootstrap>, { kind: "checkpoint" }>;
type Install = {
  readonly answer: Answer;
  readonly guard: CopyMeta;
  readonly checkpoint: ValidatedCheckpoint;
};
const sourceBootstrap = async (context: CheckpointSyncContext, input: Install): Promise<number> => {
  const { state, store, pullSource } = context;
  const { answer, guard, checkpoint } = input;
  const copy = state.copy();
  const source = valueOrThrow(
    await readCompleteSource({
      storeId: answer.storeId,
      through: answer.throughSeq,
      pull: pullSource,
      isCurrent: () => !context.runtime.isClosed && state.copy() === copy,
    }),
  );
  const ids = new Set(source.map((record) => record.event.id));
  if (checkpoint.value.eventIds.some((id) => !ids.has(id))) {
    throw new SyncError(HISTORY_INCOMPLETE);
  }
  valueOrThrow(
    await state.commitSnapshot(async () => {
      assertLive(context);
      return await store.installHistory({
        guard,
        through: answer.throughSeq,
        sourceRecords: source,
      });
    }),
  );
  const current = await readSameCopy(context, guard);
  valueOrThrow(
    await state.commitSnapshot(async () => {
      assertLive(context);
      return await store.applyRemotePage({
        guard: current,
        storeId: answer.storeId,
        since: current.cursor,
        seq: answer.throughSeq,
        records: source.filter((record) => record.seq > current.cursor),
      });
    }),
  );
  await state.rematerialize();
  return source.length;
};
/**
The checkpoint is checked whole (hash, version, shape, store). Its tail is read as any tail page:
an event this build cannot read is left out, never a reason to refuse the bootstrap.
*/
const validateAnswer = async (context: CheckpointSyncContext, answer: Answer) => {
  const checkpoint = valueOrThrow(
    await validateCheckpoint(
      { json: answer.checkpointJson, sha256: answer.checkpointSha256, storeId: answer.storeId },
      context.hash,
    ),
  );
  if (answer.seq > answer.throughSeq || checkpoint.value.coveredSeq > answer.seq) {
    throw new SyncError(HISTORY_INCOMPLETE);
  }
  const records = valueOrThrow(
    readTailRecords(answer.records, { since: checkpoint.value.coveredSeq, seq: answer.seq }),
  );
  return { checkpoint, records };
};
const recoverBootstrap = async (
  context: CheckpointSyncContext,
  input: Install & { readonly error: string },
): Promise<number> => {
  if (input.error !== REBUILD_REQUIRED) {
    throw new SyncError(input.error);
  }
  const current = await context.store.readMeta();
  if (current.cursor > input.guard.cursor) {
    await context.state.rematerialize();
    return 0;
  }
  return await sourceBootstrap(context, input);
};
const installCheckpoint = async (
  context: CheckpointSyncContext,
  input: { readonly answer: Answer; readonly guard: CopyMeta; readonly copy: number },
): Promise<number> => {
  const { answer, guard, copy } = input;
  const { state, store } = context;
  const { checkpoint, records } = await validateAnswer(context, answer);
  assertRequestCopy(context, copy);
  const installed = await state.commitSnapshot(async () => {
    assertLive(context);
    return await store.installBootstrap({
      guard,
      checkpoint,
      records,
      seq: answer.seq,
      // The base and its tail were read under this build's schema, as a legacy pull's pages are.
      syncVersion: SYNC_SCHEMA_VERSION,
    });
  });
  if (installed.ok) {
    await state.rematerialize();
    return records.length;
  }
  return await recoverBootstrap(context, { answer, guard, checkpoint, error: installed.error });
};
const requestBootstrap = async (context: CheckpointSyncContext) => {
  const guard = await readOwnedMeta(context);
  const copy = context.state.copy();
  const answer = await context.api.call(endpoints.sync.bootstrap, {
    query: { limit: String(SYNC_PAGE) },
  });
  assertRequestCopy(context, copy);
  return { guard, copy, answer };
};
const acceptSource = async (
  context: CheckpointSyncContext,
  input: { readonly storeId: string; readonly guard: CopyMeta },
): Promise<number> => {
  const { runtime } = context;
  runtime.sourceStore = input.storeId;
  if (input.guard.coverage === "checkpoint" && input.guard.storeId === input.storeId) {
    valueOrThrow(await context.history.ensureComplete());
  }
  runtime.initialized = true;
  return 0;
};
export const bootstrapCheckpoint = async (context: CheckpointSyncContext): Promise<number> => {
  const { runtime } = context;
  const { answer, guard, copy } = await requestBootstrap(context);
  if (answer.kind === "source") {
    return await acceptSource(context, { storeId: answer.storeId, guard });
  }
  runtime.sourceStore = null;
  const pulled = await installCheckpoint(context, { answer, guard, copy });
  runtime.initialized = true;
  return pulled;
};
