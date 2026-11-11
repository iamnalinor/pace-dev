import type { accountCleanupOperations } from "./db/d1-schema.ts";
import type { Problem } from "./problem.ts";

const CLEANUP_ERRORS = [
  "cleanup/archive-unavailable",
  "cleanup/busy",
  "cleanup/invalid",
  "cleanup/unavailable",
] as const;
export type CleanupError = (typeof CLEANUP_ERRORS)[number];

/** Whether a message is a cleanup code: a store throws them across the RPC boundary. */
export const isCleanupError = (message: string): message is CleanupError =>
  CLEANUP_ERRORS.some((code) => code === message);

/**
A store's refusal during an account cleanup, as HTTP. While a wipe or deletion holds the store
(fenced) every call is refused: a 503 the client retries, never a 500 that reads as a bug.
*/
export const cleanupProblem = (code: CleanupError): Problem => {
  switch (code) {
    case "cleanup/busy": {
      return { status: 503, code, message: "An account change is in progress; try again shortly" };
    }
    case "cleanup/archive-unavailable":
    case "cleanup/unavailable": {
      return { status: 503, code, message: "Storage is unavailable; try again shortly" };
    }
    case "cleanup/invalid": {
      return { status: 500, code: "internal", message: "Internal server error" };
    }
  }
};
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
