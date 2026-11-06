import { type EndpointOutput, endpoints } from "@pace/core";

import type { LocalSnapshot, ValidatedCheckpoint } from "./checkpoint-store-types.ts";

import { isSameCopy } from "./checkpoint-store.ts";
import {
  assertLive,
  assertRequestCopy,
  type CheckpointSyncContext,
  readOwnedSnapshot,
  requireValue,
} from "./checkpoint-sync-types.ts";
import { parseSourceRecords, validateCheckpoint } from "./checkpoint-validation.ts";
import { readCompleteSource } from "./history-source.ts";

const readSameCopy = async (
  context: CheckpointSyncContext,
  guard: LocalSnapshot,
): Promise<LocalSnapshot> => {
  const current = await context.store.readSnapshot();
  if (!isSameCopy(current, guard)) {
    throw new Error("sync/copy-changed");
  }
  return current;
};
type Answer = Extract<EndpointOutput<typeof endpoints.sync.bootstrap>, { kind: "checkpoint" }>;
const sourceBootstrap = async (
  context: CheckpointSyncContext,
  input: {
    readonly answer: Answer;
    readonly guard: LocalSnapshot;
    readonly checkpoint: ValidatedCheckpoint;
  },
): Promise<number> => {
  const { state, store, pullSource } = context;
  const { answer, guard, checkpoint } = input;
  const copy = state.copy();
  const source = requireValue(
    await readCompleteSource({
      storeId: answer.storeId,
      through: answer.throughSeq,
      pull: pullSource,
      isCurrent: () => !context.runtime.isClosed && state.copy() === copy,
    }),
  );
  const ids = new Set(source.map((record) => record.event.id));
  if (checkpoint.value.eventIds.some((id) => !ids.has(id))) {
    throw new Error("history/incomplete");
  }
  requireValue(
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
  requireValue(
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
const validateAnswer = async (context: CheckpointSyncContext, answer: Answer) => {
  const checkpoint = requireValue(
    await validateCheckpoint(
      { json: answer.checkpointJson, sha256: answer.checkpointSha256, storeId: answer.storeId },
      context.hash,
    ),
  );
  const records = requireValue(parseSourceRecords(answer.records));
  if (answer.seq > answer.throughSeq || checkpoint.value.coveredSeq > answer.seq) {
    throw new Error("history/incomplete");
  }
  return { checkpoint, records };
};
const recoverBootstrap = async (
  context: CheckpointSyncContext,
  input: {
    readonly error: string;
    readonly answer: Answer;
    readonly guard: LocalSnapshot;
    readonly checkpoint: ValidatedCheckpoint;
  },
): Promise<number> => {
  if (input.error !== "history/rebuild-required") {
    throw new Error(input.error);
  }
  const current = await context.store.readSnapshot();
  if (current.cursor > input.guard.cursor) {
    await context.state.rematerialize();
    return 0;
  }
  return await sourceBootstrap(context, input);
};
const installCheckpoint = async (
  context: CheckpointSyncContext,
  input: { readonly answer: Answer; readonly guard: LocalSnapshot; readonly copy: number },
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
      syncVersion: 2,
    });
  });
  if (installed.ok) {
    await state.rematerialize();
    return records.length;
  }
  return await recoverBootstrap(context, { answer, guard, checkpoint, error: installed.error });
};
const requestBootstrap = async (context: CheckpointSyncContext) => {
  const guard = await readOwnedSnapshot(context);
  const copy = context.state.copy();
  const answer = await context.api.call(endpoints.sync.bootstrap, { query: { limit: "200" } });
  assertRequestCopy(context, copy);
  return { guard, copy, answer };
};
const acceptSource = async (
  context: CheckpointSyncContext,
  input: { readonly storeId: string; readonly guard: LocalSnapshot },
): Promise<number> => {
  const { runtime } = context;
  runtime.sourceStore = input.storeId;
  if (input.guard.coverage === "checkpoint" && input.guard.storeId === input.storeId) {
    requireValue(await context.history.ensureComplete());
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
