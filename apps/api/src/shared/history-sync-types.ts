import type { EventPage, StoredEvent } from "./contract.ts";

export type StoredSyncRecord = { readonly seq: number; readonly event: StoredEvent };
export type HistoryPullInput = {
  readonly since: number;
  readonly limit: number;
  readonly storeId?: string | undefined;
  readonly through?: number | undefined;
  readonly checkpointVersion?: 1 | undefined;
};
export type HistoryPullError = "store/changed" | "sync/invalid-cursor";
export type HistoryPull = EventPage & {
  readonly storeId: string;
  readonly records?: readonly StoredSyncRecord[];
  readonly bootstrapRequired?: boolean;
};
export type CheckpointBootstrap =
  | {
      readonly kind: "checkpoint";
      readonly storeId: string;
      readonly checkpointJson: string;
      readonly checkpointSha256: string;
      readonly throughSeq: number;
      readonly records: readonly StoredSyncRecord[];
      readonly seq: number;
      readonly more: boolean;
    }
  | { readonly kind: "source"; readonly storeId: string };
