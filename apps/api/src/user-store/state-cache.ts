import { type Checkpoint, type Event, isCorrection } from "@pace/core";

import type { ActorStorage } from "../shared/ports/actor-storage.ts";
import type { SqliteDatabase } from "../shared/ports/sqlite.ts";
import type * as schema from "./schema.ts";

import { CheckpointCache, type CheckpointMode } from "./checkpoint-cache.ts";
import * as log from "./log-queries.ts";
import { SERVER_TZ } from "./notifier.ts";
import {
  isMarkedAt,
  markOf,
  rewriteChanged,
  rewriteProjections,
  saveMark,
  updateProjections,
} from "./projections.ts";
import {
  applyInOrder,
  canApplyInOrder,
  type Log,
  type Materialized,
  rebuild,
  touchedBy,
} from "./state.ts";

type Db = SqliteDatabase<"sync", typeof schema>;

/**
A store's materialized state, cached in memory with the log sequence it was built at, and the
projection rows that mirror it. An instance starts with nothing in memory (production evicts one
idle for a minute or two, so between alarms at night and phone uploads every one starts cold): a rebuild
loads the log, but rewrites the rows only when their mark (`ProjectionMark`) is behind the log or
from another build, or the build has no version (`dev`), and the zone is read from that mark without loading the log at all.
*/
export class StateCache {
  #cache: Materialized | undefined;

  #checkpoint: CheckpointCache | undefined;

  readonly #checkpointOptions: { readonly mode: CheckpointMode; readonly now: () => string };

  /**
  The log as last loaded, kept in step with what goes in: a pass that reads the log and then
  writes, or a write out of order, rebuilds from it without loading the log again.
  */
  #log: Log | undefined;

  #correctionTargets = new Set<string>();

  readonly #db: Db;

  readonly #storage: ActorStorage;

  /** What writes the rows: the deploy's version and the tables' newest migration. */
  readonly #build: string;

  /**
  Whether the build has a version a deploy named: one without (`dev`, as a self-hosted deploy
  without `PACE_VERSION`) may be newer code under the same name, so its cold starts rewrite every
  row whatever the mark says.
  */
  readonly #isNamed: boolean;

  constructor({
    build,
    db,
    isNamed,
    storage,
    checkpointMode = "off",
    now = () => new Date().toISOString(),
  }: {
    readonly build: string;
    readonly isNamed: boolean;
    readonly db: Db;
    readonly storage: ActorStorage;
    readonly checkpointMode?: CheckpointMode;
    readonly now?: () => string;
  }) {
    this.#build = build;
    this.#isNamed = isNamed;
    this.#db = db;
    this.#storage = storage;
    this.#checkpointOptions = { mode: checkpointMode, now };
    this.#checkpoint = this.#newCheckpoint();
  }

  #newCheckpoint(): CheckpointCache | undefined {
    const { mode, now } = this.#checkpointOptions;
    return mode === "off" || !this.#isNamed
      ? undefined
      : new CheckpointCache({
          db: this.#db,
          storage: this.#storage,
          build: this.#build,
          mode,
          now,
        });
  }

  async #mark({ seq, state }: Materialized): Promise<void> {
    await saveMark(this.#storage, { build: this.#build, seq, state });
  }

  async #logAt(seq: number): Promise<Log> {
    if (this.#log?.seq !== seq) {
      this.#log = { events: await log.loadLog(this.#db, seq), seq };
      this.#correctionTargets = new Set(
        this.#log.events.filter(isCorrection).map((event) => event.payload.targetId),
      );
    }
    return this.#log;
  }

  /**
  A write out of order: the state is rebuilt from the log, and only the rows that differ from
  `before` are rewritten while the rows mirrored it (else every row).
  */
  async #rebuildAfter(before: Materialized, seq: number): Promise<void> {
    const rebuilt = rebuild(await this.#logAt(seq));
    if (isMarkedAt(await markOf(this.#storage), { build: this.#build, seq: before.seq })) {
      await rewriteChanged(this.#db, { after: rebuilt.state, before: before.state });
    } else {
      await rewriteProjections(this.#db, rebuilt.state);
    }
    await this.#mark(rebuilt);
    this.#cache = rebuilt;
  }
  /** The whole log, corrections included: loaded once for the seq it is at. */
  async log(): Promise<readonly Event[]> {
    const { events } = await this.#logAt(await log.latestSeq(this.#db));
    return events;
  }

  /** The cached state, rebuilt from the log when the cache is missing or behind it. */
  async current(): Promise<Materialized> {
    const seq = await log.latestSeq(this.#db);
    if (this.#cache?.seq === seq) {
      await this.#checkpoint?.advance(this.#cache);
      return this.#cache;
    }
    const rebuilt =
      this.#checkpoint === undefined
        ? rebuild(await this.#logAt(seq))
        : await this.#checkpoint.current(seq, async () => await this.#logAt(seq));
    if (!this.#isNamed || !isMarkedAt(await markOf(this.#storage), { build: this.#build, seq })) {
      await rewriteProjections(this.#db, rebuilt.state);
      await this.#mark(rebuilt);
    }
    this.#cache = rebuilt;
    return rebuilt;
  }

  /** The person's zone (the account's, else the server's): from the mark while it is current. */
  async zone(): Promise<string> {
    const mark = await markOf(this.#storage);
    if (isMarkedAt(mark, { build: this.#build, seq: await log.latestSeq(this.#db) })) {
      return mark.timezone ?? SERVER_TZ;
    }
    const { state } = await this.current();
    return state.settings.timezone ?? SERVER_TZ;
  }

  /**
  Folds the events just inserted (the log is at `seq` now) into the state and the rows,
  incrementally when they are in order and from scratch otherwise.
  */
  async fold(before: Materialized, inserted: readonly Event[], seq: number): Promise<void> {
    for (const event of inserted) {
      if (isCorrection(event)) {
        this.#correctionTargets.add(event.payload.targetId);
      }
    }
    this.#log =
      this.#log?.seq === before.seq
        ? { events: [...this.#log.events, ...inserted], seq }
        : undefined;
    const isFulfillsCorrection = inserted.some(
      (event) =>
        this.#correctionTargets.has(event.id) || (this.#checkpoint?.targets(event.id) ?? false),
    );
    if (!isFulfillsCorrection && canApplyInOrder(before, inserted)) {
      const next = applyInOrder(before, inserted, seq);
      await updateProjections(this.#db, next.state, touchedBy(inserted));
      await this.#mark(next);
      this.#cache = next;
    } else {
      await this.#rebuildAfter(before, seq);
    }
  }

  checkpointPublished(checkpoint: Checkpoint): void {
    this.#checkpoint?.adopt(checkpoint);
  }

  /** Drops what is in memory (the store was wiped). */
  forget(): void {
    this.#cache = undefined;
    this.#log = undefined;
    this.#checkpoint = this.#newCheckpoint();
    this.#correctionTargets = new Set();
  }
}
