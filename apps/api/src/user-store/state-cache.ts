import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import type { Event } from "@pace/core";

import type * as schema from "./schema.ts";

import * as log from "./log-queries.ts";
import { SERVER_TZ } from "./notifier.ts";
import {
  isMarkedAt,
  markOf,
  rewriteProjections,
  saveMark,
  updateProjections,
} from "./projections.ts";
import { applyInOrder, canApplyInOrder, type Materialized, rebuild, touchedBy } from "./state.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

/**
A store's materialized state, cached in memory with the log sequence it was built at, and the
projection rows that mirror it. An instance starts with nothing in memory (production evicts one
idle for a minute or two, so between alarms 15 minutes apart every one starts cold): a rebuild
loads the log, but rewrites the rows only when their mark (`ProjectionMark`) is behind the log or
from another build, and the zone is read from that mark without loading the log at all.
*/
export class StateCache {
  #cache: Materialized | undefined;

  readonly #db: Db;

  readonly #storage: DurableObjectStorage;

  /** What writes the rows: the deploy's version and the tables' newest migration. */
  readonly #build: string;

  constructor({
    build,
    db,
    storage,
  }: {
    readonly build: string;
    readonly db: Db;
    readonly storage: DurableObjectStorage;
  }) {
    this.#build = build;
    this.#db = db;
    this.#storage = storage;
  }

  async #mark({ seq, state }: Materialized): Promise<void> {
    await saveMark(this.#storage, { build: this.#build, seq, state });
  }

  /** The cached state, rebuilt from the log when the cache is missing or behind it. */
  async current(): Promise<Materialized> {
    const seq = await log.latestSeq(this.#db);
    if (this.#cache?.seq === seq) {
      return this.#cache;
    }
    const rebuilt = rebuild({ events: await log.loadLog(this.#db), seq });
    if (!isMarkedAt(await markOf(this.#storage), { build: this.#build, seq })) {
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
    if (canApplyInOrder(before, inserted)) {
      const next = applyInOrder(before, inserted, seq);
      await updateProjections(this.#db, next.state, touchedBy(inserted));
      await this.#mark(next);
      this.#cache = next;
    } else {
      this.#cache = undefined;
      await this.current();
    }
  }

  /** Drops what is in memory (the store was wiped). */
  forget(): void {
    this.#cache = undefined;
  }
}
