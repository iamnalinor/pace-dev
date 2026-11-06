import type { accountCleanupOperations } from "./db/d1-schema.ts";

export type CleanupError =
  | "cleanup/archive-unavailable"
  | "cleanup/busy"
  | "cleanup/invalid"
  | "cleanup/unavailable";
export type AccountCleanup = typeof accountCleanupOperations.$inferSelect;
export type LeasedAccountCleanup = AccountCleanup & {
  readonly leaseToken: string;
  readonly leaseUntil: Date;
};
export type CleanupInput = {
  readonly operationId: string;
  readonly userId: string;
  readonly action: "delete" | "wipe";
  readonly now: Date;
};

export type CleanupOutcome = {
  readonly operationId: string;
  readonly status: "complete" | "pending";
};
