import { type CoreState, err, type Event, ok, type Result } from "@pace/core";

export type HistoryError =
  | "history/incomplete"
  | "history/not-loaded"
  | "history/offline"
  | "history/unavailable"
  | "sync/copy-changed";
/**
How far the load of the complete history is: one value, so an error exists exactly while the load
has failed (two fields could say "failed" with no error, or keep an error past a retry).
*/
export type HistoryProgress =
  | { readonly status: "failed"; readonly error: HistoryError }
  | { readonly status: "idle" | "loading" | "ready" };
export type HistoryCoordinator = {
  readonly ensureComplete: () => Promise<Result<void, HistoryError>>;
  readonly close: () => void;
};
/** Full coverage is required by every complete-source consumer. */
export type CompleteHistorySource = CoreState & {
  readonly historyCoverage: "full";
  readonly log: readonly Event[];
  readonly events: readonly Event[];
};
export const completeHistoryOf = (
  state: CoreState & {
    readonly historyCoverage: "checkpoint" | "full";
    readonly status?: "loading" | "ready";
    readonly log: readonly Event[];
    readonly events: readonly Event[];
  },
): Result<CompleteHistorySource, "history/not-loaded"> =>
  state.historyCoverage === "full" && state.status !== "loading"
    ? ok({ ...state, historyCoverage: "full" })
    : err("history/not-loaded");
