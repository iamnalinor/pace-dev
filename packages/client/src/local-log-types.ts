import type { Event, Result } from "@pace/core";

import type { LocalSnapshot } from "./checkpoint-store-types.ts";
import type { StoreChange } from "./peer-tabs.ts";
/** Why a write the state already shows was taken back: the local store refused it. */
export type PersistError = "persist_failed";

/** The outcome of one write to the local store, once it settles. */
export type Persisted = Promise<Result<readonly Event[], PersistError>>;

/**
Events the state shows already, and their write to the local store. A refused write takes them
out of the state again (rebuilt from the rest of the log) and answers `persist_failed`.
*/
export type Staged = {
  readonly events: readonly Event[];
  readonly persisted: Persisted;
};

/** How the state folds events: in order on top of itself, or rebuilt from the whole log. */
export type Fold<S> = {
  readonly applyInOrder: (state: S, fresh: readonly Event[]) => S;
  readonly rebuild: (state: S, all: readonly Event[], snapshot?: LocalSnapshot) => S;
  readonly lastAppliedOccurredAt: (state: S) => null | string;
};

export type LocalLog = {
  readonly invalidate: () => void;
  readonly settled: () => Promise<void>;
  readonly snapshot: () => LocalSnapshot | undefined;
  readonly adoptPeer: (change: StoreChange) => Promise<void>;
  readonly has: (id: string) => boolean;
  /** Shows the events at once, then writes them; a refused write takes them back. */
  readonly persistLocal: (events: readonly Event[]) => Persisted;
  /**
  The same for the server's events (unknown ids only), written as synced. A store that refuses
  them rejects with its own error, after taking them back.
  */
  readonly persistRemote: (events: readonly Event[]) => Persisted;
  /** Reads the whole log from the store again, once the writes in flight have settled. */
  readonly reload: () => Promise<void>;
  /** Takes in events another tab already wrote to the shared store (unknown ids only, no write). */
  readonly adopt: (events: readonly Event[]) => void;
  /**
  Drops the local copy (sign-out, another server, a reset store): the state is empty at once, and
  the store is cleared in the write queue, after the write in flight; a write still waiting
  behind it is never made. With `ifOwner`, the store keeps a copy another session claimed since
  (`EventStore.clear`); the state is emptied either way.
  */
  readonly clear: (ifOwner?: string) => Promise<void>;
  /**
  Marks the copy as a session's (`EventStore.setOwner`) through the same write chain as `clear`,
  so a sign-out's clear queued before it has its turn first (fix round 2 review M7).
  */
  readonly claim: (mark: string) => Promise<void>;
};
