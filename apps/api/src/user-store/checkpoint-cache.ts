import { isDeepStrictEqual } from "node:util";

import {
  type Checkpoint,
  checkpointCutoff,
  createCheckpoint,
  effectiveInOrder,
  replayCheckpoint,
} from "@pace/core";

import type { ActorStorage } from "../shared/ports/actor-storage.ts";
import type { SqliteDatabase } from "../shared/ports/sqlite.ts";
import type * as schema from "./schema.ts";

import { createLogger } from "../shared/logger.ts";
import { CheckpointRepository } from "./checkpoint-repository.ts";
import { checkpointPrefix, loadRecords } from "./log-queries.ts";
import { SERVER_TZ } from "./notifier.ts";
import { type Log, type Materialized, rebuild } from "./state.ts";
import { storeIdOf } from "./store-identity.ts";

export type CheckpointMode = "active" | "off" | "shadow";
type Db = SqliteDatabase<"sync", typeof schema>;
const log = createLogger("info");

/** Snapshot selection is independent from the projection writer and every full-source consumer. */
export class CheckpointCache {
  readonly #db: Db;
  readonly #storage: ActorStorage;
  readonly #build: string;
  readonly #mode: Exclude<CheckpointMode, "off">;
  readonly #now: () => string;
  readonly #repository: CheckpointRepository;
  #snapshot: Checkpoint | undefined;
  #targets: ReadonlySet<string> = new Set();
  #checkedCutoff: string | undefined;

  constructor(options: {
    readonly db: Db;
    readonly storage: ActorStorage;
    readonly build: string;
    readonly mode: Exclude<CheckpointMode, "off">;
    readonly now: () => string;
  }) {
    this.#db = options.db;
    this.#storage = options.storage;
    this.#build = options.build;
    this.#mode = options.mode;
    this.#now = options.now;
    this.#repository = new CheckpointRepository(options.storage);
  }

  async #candidate(seq: number): Promise<Materialized | undefined> {
    const snapshot = this.#snapshot;
    if (snapshot === undefined) {
      return undefined;
    }
    const tail = await loadRecords(this.#db, snapshot.coveredSeq, seq);
    if (!tail.complete) {
      return undefined;
    }
    const replayed = replayCheckpoint(snapshot, tail.records);
    // A valid base can remain useful after a later cutoff includes a currently unsafe tail.
    // Replacing the identical prefix cannot resolve a recent correction or retroactive event.
    if (!replayed.ok || replayed.value.seq !== seq) {
      return undefined;
    }
    const value = replayed.value;
    return {
      state: value.state,
      ids: new Set(value.ids),
      lastAppliedOccurredAt: value.lastEffective?.occurredAt ?? null,
      seq: value.seq,
    };
  }

  #matches(candidate: Materialized, full: Log, current: Materialized): boolean {
    const last = effectiveInOrder(full.events).at(-1);
    const snapshot = this.#snapshot;
    if (snapshot === undefined) {
      return false;
    }
    const coveredIds = new Set(snapshot.eventIds);
    const tail = full.events.filter((event) => !coveredIds.has(event.id));
    const candidateLast = effectiveInOrder(tail).at(-1) ?? snapshot.lastEffective;
    return (
      isDeepStrictEqual(candidate.state, current.state) &&
      isDeepStrictEqual(candidate.ids, current.ids) &&
      isDeepStrictEqual(
        last === undefined ? null : { occurredAt: last.occurredAt, id: last.id },
        candidateLast === null
          ? null
          : { occurredAt: candidateLast.occurredAt, id: candidateLast.id },
      )
    );
  }

  #shouldAdvance(timezone: string, cutoff: string): boolean {
    const marker = `${timezone}:${cutoff}`;
    if (this.#checkedCutoff === marker) {
      return false;
    }
    this.#checkedCutoff = marker;
    return this.#snapshot?.cutoff !== cutoff || this.#snapshot.cutoffTimezone !== timezone;
  }

  async #publishPrefix(
    current: Materialized,
    input: { readonly timezone: string; readonly cutoff: string; readonly coveredSeq: number },
  ): Promise<void> {
    const prefix = await loadRecords(this.#db, 0, input.coveredSeq);
    if (!prefix.complete) {
      return;
    }
    const snapshot = createCheckpoint({
      build: this.#build,
      storeId: await storeIdOf(this.#storage),
      coveredSeq: input.coveredSeq,
      cutoff: input.cutoff,
      cutoffTimezone: input.timezone,
      records: prefix.records,
    });
    if (!(snapshot.ok && (await this.#repository.publish(snapshot.value, current.seq)))) {
      return;
    }
    this.#snapshot = snapshot.value;
    this.#targets = new Set(snapshot.value.correctionTargets);
  }

  adopt(checkpoint: Checkpoint): void {
    this.#snapshot = checkpoint;
    this.#targets = new Set(checkpoint.correctionTargets);
    this.#checkedCutoff = undefined;
  }

  targets(id: string): boolean {
    return this.#targets.has(id);
  }

  async current(seq: number, source: () => Promise<Log>): Promise<Materialized> {
    const storeId = await storeIdOf(this.#storage);
    const persisted = await this.#repository.read({ build: this.#build, storeId });
    this.#snapshot =
      persisted.kind === "valid" && persisted.checkpoint.coveredSeq <= seq
        ? persisted.checkpoint
        : undefined;
    this.#targets = new Set(this.#snapshot?.correctionTargets);
    const candidate = await this.#candidate(seq);
    let current: Materialized;
    if (candidate !== undefined && this.#mode === "active") {
      current = candidate;
    } else {
      const full = await source();
      current = rebuild(full);
      if (candidate !== undefined && !this.#matches(candidate, full, current)) {
        log.error("history/checkpoint-shadow-mismatch");
        this.#snapshot = undefined;
      }
    }
    await this.advance(current);
    return current;
  }

  /** Once per local day, capture an exact cursor prefix before any hashing await. */
  async advance(current: Materialized): Promise<void> {
    if (current.seq === 0) {
      return;
    }
    const timezone = current.state.settings.timezone ?? SERVER_TZ;
    const cutoff = checkpointCutoff(this.#now(), timezone);
    if (!cutoff.ok || !this.#shouldAdvance(timezone, cutoff.value)) {
      return;
    }
    const coveredSeq = await checkpointPrefix(this.#db, cutoff.value, current.seq);
    if (coveredSeq <= (this.#snapshot?.coveredSeq ?? 0)) {
      return;
    }
    await this.#publishPrefix(current, { timezone, cutoff: cutoff.value, coveredSeq });
  }
}
