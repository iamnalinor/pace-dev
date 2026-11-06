import {
  appendLocalSnapshot,
  bootstrapSnapshot,
  type CheckpointStore,
  type CopyGuard,
  historySnapshot,
  legacyPageSnapshot,
  type LocalSnapshot,
  remotePageSnapshot,
  type Sha256Text,
  validateCheckpoint,
} from "@pace/client";
import { err, type Event, type Result } from "@pace/core";

type SnapshotChange = <E>(
  update: (current: LocalSnapshot) => Result<LocalSnapshot, E>,
) => Promise<Result<LocalSnapshot, "sync/copy-changed" | E>>;
export type GuardedAppendInput = { readonly events: readonly Event[]; readonly guard: CopyGuard };

/** Platforms supply the atomic change; validation remains outside that transaction. */
export const checkpointOperations = (
  hash: Sha256Text,
  change: SnapshotChange,
): Omit<CheckpointStore, "readSnapshot"> => ({
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
      : err("history/rebuild-required");
  },
  applyLegacyPage: async (input) => await change((current) => legacyPageSnapshot(current, input)),
  applyRemotePage: async (input) => await change((current) => remotePageSnapshot(current, input)),
  installHistory: async (input) => await change((current) => historySnapshot(current, input)),
});

export const appendSnapshotEvents = async (
  change: SnapshotChange,
  input: GuardedAppendInput,
): Promise<void> => {
  const result = await change((current) => appendLocalSnapshot(current, input));
  if (!result.ok) {
    throw new Error(result.error);
  }
};
