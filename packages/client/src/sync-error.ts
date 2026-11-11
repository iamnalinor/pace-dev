import type { Result } from "@pace/core";

/** A run's page belonged to a local copy that was wiped or changed hands while it was on its way. */
export const COPY_CHANGED = "sync/copy-changed";
/** A page or a source read that breaks the contract: out of order, short, or unreadable. */
export const HISTORY_INCOMPLETE = "history/incomplete";
/** The local copy cannot take the change as it is: its source is needed, or it moved meanwhile. */
export const REBUILD_REQUIRED = "history/rebuild-required";
/**
The checkpoint run needed the complete source and this build cannot read all of it (an event of a
newer client sits in it). The copy is turned into a full one by the tolerant legacy pull instead
(`sync-run.ts`), with its outbox kept; the pinned read itself stays strict (bug-lessons 361).
*/
export const SOURCE_UNREADABLE = "checkpoint/source-unreadable";
/** The server asked for a bootstrap again right after one was installed. */
export const REPEATED_BOOTSTRAP = "checkpoint/repeated-bootstrap";

/** The live socket answered a request with something that is not its answer. */
export const INVALID_RESPONSE = "sync/invalid-response";

/**
A refusal of the sync or of the local store, thrown where a `Result` cannot travel (out of a
store adapter, through the write queue). It is read by its `code`, never by its message; the
message is the code, so a status line that prints the error shows it.
*/
export class SyncError<C extends string = string> extends Error {
  readonly code: C;
  constructor(code: C) {
    super(code);
    this.name = "SyncError";
    this.code = code;
  }
}

export const isSyncError = (error: unknown, code: string): boolean =>
  error instanceof SyncError && error.code === code;

/** The value of a `Result`, or its error code thrown as a `SyncError`. */
export const valueOrThrow = <T, E extends string>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new SyncError(result.error);
  }
  return result.value;
};
