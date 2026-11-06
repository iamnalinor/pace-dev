import type { Checkpoint, Event, Result, SequencedCheckpointEvent } from "@pace/core";

/** Only json and sha256 are persisted; value is validated before a transaction starts. */
export type ValidatedCheckpoint = {
  readonly json: string;
  readonly sha256: string;
  readonly value: Checkpoint;
};
export type LocalRecord = { readonly seq: null | number; readonly event: Event };
export type LocalSnapshot = {
  readonly copyToken: string;
  readonly owner: null | string;
  readonly storeId: null | string;
  readonly cursor: number;
  readonly syncVersion: number;
  /** checkpoint coverage with a null base explicitly means unreadable persisted base; never rebuild as an empty full log. */
  readonly checkpoint: null | ValidatedCheckpoint;
  readonly coverage: "checkpoint" | "full";
  readonly records: readonly LocalRecord[];
  readonly pendingIds: readonly string[];
};
export type CopyGuard = Pick<LocalSnapshot, "copyToken" | "cursor" | "owner" | "storeId">;
export type InstallBootstrap = {
  readonly guard: CopyGuard;
  readonly checkpoint: ValidatedCheckpoint;
  readonly records: readonly SequencedCheckpointEvent[];
  readonly seq: number;
  readonly syncVersion: number;
};
export type ApplyLegacyPage = {
  readonly guard: CopyGuard;
  readonly storeId: string;
  readonly since: number;
  readonly seq: number;
  readonly events: readonly Event[];
  readonly syncVersion?: number;
};
export type ApplyRemotePage = {
  readonly guard: CopyGuard;
  readonly storeId: string;
  readonly since: number;
  readonly seq: number;
  readonly records: readonly SequencedCheckpointEvent[];
};
export type InstallHistory = {
  readonly guard: CopyGuard;
  readonly through: number;
  readonly sourceRecords: readonly SequencedCheckpointEvent[];
};
export type CopyError = "sync/copy-changed";
export type RebuildError = "history/rebuild-required" | CopyError;
export type CheckpointStore = {
  readonly readSnapshot: () => Promise<LocalSnapshot>;
  readonly installBootstrap: (
    input: InstallBootstrap,
  ) => Promise<Result<LocalSnapshot, RebuildError>>;
  readonly applyLegacyPage: (
    input: ApplyLegacyPage,
  ) => Promise<Result<LocalSnapshot, RebuildError>>;
  readonly applyRemotePage: (
    input: ApplyRemotePage,
  ) => Promise<Result<LocalSnapshot, RebuildError>>;
  readonly installHistory: (
    input: InstallHistory,
  ) => Promise<Result<LocalSnapshot, "history/incomplete" | CopyError>>;
};
