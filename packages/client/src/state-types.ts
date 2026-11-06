import type { StoreApi } from "zustand/vanilla";

import type {
  Checkpoint,
  Event,
  EventInput,
  PresetsState,
  ProjectsState,
  Result,
  SeriesState,
  Settings,
  TasksState,
  TimeState,
} from "@pace/core";

import type { CopyGuard, LocalSnapshot } from "./checkpoint-store-types.ts";
import type { EventStore } from "./event-store.ts";
import type { HistoryError } from "./history-types.ts";
import type { Staged } from "./local-log.ts";
import type { StoreChange } from "./peer-tabs.ts";
/**
The whole client state: the materialized slices (the same four as the core's `CoreState`,
so every query reads it as is) plus the log and bookkeeping.
*/
export type AppState = {
  readonly status: "loading" | "ready";
  readonly historyCoverage: "checkpoint" | "full";
  readonly checkpoint: Checkpoint | null;
  readonly knownEventIds: ReadonlySet<string>;
  readonly historyStatus: "failed" | "idle" | "loading" | "ready";
  readonly historyError: HistoryError | null;
  /** Resident effective events in canonical order; complete only when historyCoverage is full. */
  readonly events: readonly Event[];
  /** Resident source envelopes, corrections included. Complete consumers must use completeHistoryOf. */
  readonly log: readonly Event[];
  readonly tasks: TasksState;
  readonly projects: ProjectsState;
  readonly presets: PresetsState;
  readonly settings: Settings;
  readonly time: TimeState;
  readonly series: SeriesState;
  readonly deviceId: string;
  readonly lastAppliedOccurredAt: null | string;
  /** Bumps on every change; cheap way for view-models to memoize. */
  readonly version: number;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What callers dispatch: the store fills `id`, `recordedAt`, `deviceId`, `source`, `precision`. */
export type DispatchInput = DistributiveOmit<EventInput, "precision" | "source"> & {
  readonly precision?: Event["precision"];
  readonly source?: Event["source"];
};

export type AppStateHandle = {
  readonly store: StoreApi<AppState>;
  readonly localCopy: () => CopyGuard | undefined;
  readonly commitSnapshot: <E extends string>(
    operation: () => Promise<Result<LocalSnapshot, E>>,
    shouldReplaceCopy?: boolean,
  ) => Promise<Result<LocalSnapshot, E>>;
  readonly ensureHistory: () => Promise<Result<void, HistoryError>>;
  readonly setHistoryLoader: (load: () => Promise<Result<void, HistoryError>>) => void;
  /** Resolves once the persisted log is loaded and materialized. */
  readonly ready: Promise<void>;
  /**
  Validates every input, then shows them all in the state at once and writes them to the local
  store in one go, answering as soon as the state shows them (or with the first refusal, before
  anything is shown). `persisted` settles with the write: refused, the events leave the state.
  */
  readonly stage: (inputs: readonly DispatchInput[]) => Promise<Result<Staged, string>>;
  /** One event, staged; answers once its local write landed (`persist_failed` when refused). */
  readonly dispatch: (input: DispatchInput) => Promise<Result<Event, string>>;
  /**
  Remote events: known ids are skipped, the rest applied at once and written as synced; rejects
  (and takes them back) when the local store refuses them.
  */
  readonly ingest: (events: readonly Event[]) => Promise<void>;
  readonly revoke: (eventId: string) => Promise<Result<Event, string>>;
  /** Revokes the latest effective event recorded by this device. */
  readonly undoLast: () => Promise<Result<Event, string>>;
  /** Full rebuild from the event store (after another writer touched it). */
  readonly rematerialize: () => Promise<void>;
  /**
  What another tab of this profile put into the store both share: its events are taken in
  without writing them again, a dropped copy is read again. Nothing is told on (no echo).
  */
  readonly adoptPeerChange: (change: StoreChange) => Promise<void>;
  /**
  Drops the local copy: the log, its outbox, the cursor and the store id go, through the write
  queue (a write still waiting is never made), and the state is empty. With `ifOwner`, the store
  keeps a copy another session of a shared store claimed since (`EventStore.clear`).
  */
  readonly clear: (ifOwner?: string) => Promise<void>;
  /** Marks the copy as a session's, in the write queue after any clear asked for before it. */
  readonly claim: (mark: string) => Promise<void>;
  /**
  Which local copy is current, bumped the moment `clear` is called (before its turn in the
  queue): a server page asked for one copy is never written into the next (fix round 1 of QA 22).
  */
  readonly copy: () => number;
};

export type AppStateOptions = {
  readonly deviceId: string;
  readonly now: () => string;
  readonly source: "app" | "web";
  readonly store: EventStore;
  /** Told after each event written here (the sync sends it within a second). */
  readonly onLocal?: () => void;
  /** Told of every change this state made to the store (for the other tabs that share it). */
  readonly onStored?: (change: StoreChange) => void;
};
