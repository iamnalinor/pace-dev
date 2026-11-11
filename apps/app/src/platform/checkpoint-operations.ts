import {
  appendLocalSnapshot,
  bootstrapSnapshot,
  type CheckpointStore,
  type CopyGuard,
  historySnapshot,
  type LocalSnapshot,
  REBUILD_REQUIRED,
  remotePageSnapshot,
  type Sha256Text,
  SyncError,
  validateCheckpoint,
} from "@pace/client";
import { err, type Event, type Result } from "@pace/core";

type SnapshotChange = <E>(
  update: (current: LocalSnapshot) => Result<LocalSnapshot, E>,
) => Promise<Result<LocalSnapshot, "sync/copy-changed" | E>>;
export type GuardedAppendInput = { readonly events: readonly Event[]; readonly guard: CopyGuard };

/**
The changes that need the whole copy (a checkpoint's install, its pages, the history). Platforms
supply the atomic change; validation remains outside that transaction.
*/
export const checkpointOperations = (
  hash: Sha256Text,
  change: SnapshotChange,
): Pick<CheckpointStore, "applyRemotePage" | "installBootstrap" | "installHistory"> => ({
  installBootstrap: async (input) => {
    const checkpoint = await validateCheckpoint(
      {
        json: input.checkpoint.json,
        sha256: input.checkpoint.sha256,
        storeId: input.checkpoint.value.storeId,
      },
      hash,
    );
    return checkpoint.ok
      ? await change((current) =>
          bootstrapSnapshot(current, { ...input, checkpoint: checkpoint.value }),
        )
      : err(REBUILD_REQUIRED);
  },
  applyRemotePage: async (input) => await change((current) => remotePageSnapshot(current, input)),
  installHistory: async (input) => await change((current) => historySnapshot(current, input)),
});

export const appendSnapshotEvents = async (
  change: SnapshotChange,
  input: GuardedAppendInput,
): Promise<void> => {
  const result = await change((current) => appendLocalSnapshot(current, input));
  if (!result.ok) {
    throw new SyncError(result.error);
  }
};
