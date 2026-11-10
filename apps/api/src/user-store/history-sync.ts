import { z } from "zod";

import {
  type Checkpoint,
  checkpointCutoff,
  createCheckpoint,
  err,
  ok,
  replayCheckpoint,
  type Result,
} from "@pace/core";

import type {
  CheckpointBootstrap,
  HistoryPull,
  HistoryPullError,
  HistoryPullInput,
} from "../shared/history-sync-types.ts";
import type { ActorStorage } from "../shared/ports/actor-storage.ts";
import type { SqliteDatabase } from "../shared/ports/sqlite.ts";
import type * as schema from "./schema.ts";
import type { Materialized } from "./state.ts";

import { sha256Hex } from "../shared/crypto.ts";
import { CheckpointRepository } from "./checkpoint-repository.ts";
import { latestSeq, listPage, loadRecords, storedPage } from "./log-queries.ts";
import { SERVER_TZ } from "./notifier.ts";
import { storeIdOf } from "./store-identity.ts";

type Options = {
  readonly storage: ActorStorage;
  readonly db: SqliteDatabase<"sync", typeof schema>;
  readonly build: string;
  readonly isEnabled: boolean;
  readonly current: () => Promise<Materialized>;
  readonly checkpointPublished: (checkpoint: Checkpoint) => void;
  readonly now?: () => string;
};
const PullBoundsSchema = z.object({
  since: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(500),
  through: z.number().int().nonnegative().optional(),
});

const hasValidBounds = (input: HistoryPullInput, latest: number): boolean => {
  return (
    PullBoundsSchema.safeParse(input).success &&
    (input.through === undefined ||
      (input.storeId !== undefined && input.since <= input.through && input.through <= latest))
  );
};

/** One actor call owns the complete generation/high-water capture, including hashing awaits. */
export class HistorySync {
  readonly #options: Options;
  readonly #repository: CheckpointRepository;
  constructor(options: Options) {
    this.#options = options;
    this.#repository = new CheckpointRepository(options.storage);
  }

  async #replace(
    through: number,
    storeId: string,
    current: Materialized,
  ): Promise<Checkpoint | undefined> {
    const source = await loadRecords(this.#options.db, 0, through);
    const timezone = current.state.settings.timezone ?? SERVER_TZ;
    const cutoff = checkpointCutoff(this.#options.now?.() ?? new Date().toISOString(), timezone);
    if (!source.complete || !cutoff.ok) {
      return undefined;
    }
    const checkpoint = createCheckpoint({
      build: this.#options.build,
      storeId,
      coveredSeq: through,
      cutoff: cutoff.value,
      cutoffTimezone: timezone,
      records: source.records,
    });
    if (!checkpoint.ok || !(await this.#repository.publish(checkpoint.value, through))) {
      return undefined;
    }
    this.#options.checkpointPublished(checkpoint.value);
    return checkpoint.value;
  }

  async #bootstrapBase(
    through: number,
    storeId: string,
    current: Materialized,
  ): Promise<Checkpoint | undefined> {
    const saved = await this.#repository.read({ build: this.#options.build, storeId });
    if (saved.kind !== "valid" || saved.checkpoint.coveredSeq > through) {
      return undefined;
    }
    const tail = await loadRecords(this.#options.db, saved.checkpoint.coveredSeq, through);
    if (!tail.complete) {
      return undefined;
    }
    const replay = replayCheckpoint(saved.checkpoint, tail.records);
    return replay.ok && replay.value.seq === through
      ? saved.checkpoint
      : await this.#replace(through, storeId, current);
  }

  async #requiresBootstrap(since: number, through: number, storeId: string): Promise<boolean> {
    if (!this.#options.isEnabled) {
      return false;
    }
    const [header] = this.#options.storage.sql
      .exec<{ covered_seq: number; store_id: string; build: string }>(
        "SELECT covered_seq,store_id,build FROM history_checkpoint WHERE id=1",
      )
      .toArray();
    if (
      header?.store_id !== storeId ||
      header.build !== this.#options.build ||
      header.covered_seq <= since ||
      header.covered_seq > through
    ) {
      return false;
    }
    const saved = await this.#repository.read({ build: this.#options.build, storeId });
    if (saved.kind !== "valid") {
      return false;
    }
    const tail = await loadRecords(this.#options.db, saved.checkpoint.coveredSeq, through);
    return tail.complete;
  }

  async bootstrap(limit: number): Promise<CheckpointBootstrap> {
    const storeId = await storeIdOf(this.#options.storage);
    if (!this.#options.isEnabled || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      return { kind: "source", storeId };
    }
    const current = await this.#options.current();
    const throughSeq = await latestSeq(this.#options.db);
    const checkpoint = await this.#bootstrapBase(throughSeq, storeId, current);
    if (checkpoint === undefined) {
      return { kind: "source", storeId };
    }
    const checkpointJson = JSON.stringify(checkpoint);
    const checkpointSha256 = await sha256Hex(checkpointJson);
    const page = storedPage(this.#options.storage, {
      after: checkpoint.coveredSeq,
      through: throughSeq,
      limit,
    });
    return {
      kind: "checkpoint",
      storeId,
      checkpointJson,
      checkpointSha256,
      throughSeq,
      records: page.records,
      seq: page.seq,
      more: page.more,
    };
  }

  async pull(input: HistoryPullInput): Promise<Result<HistoryPull, HistoryPullError>> {
    const storeId = await storeIdOf(this.#options.storage);
    if (input.storeId !== undefined && input.storeId !== storeId) {
      return err("store/changed");
    }
    const latest = await latestSeq(this.#options.db);
    if (!hasValidBounds(input, latest)) {
      return err("sync/invalid-cursor");
    }
    if (input.checkpointVersion !== 1 && input.through === undefined) {
      return ok({ ...(await listPage(this.#options.db, input.since, input.limit)), storeId });
    }
    if (input.since > latest) {
      return err("sync/invalid-cursor");
    }
    if (
      input.through === undefined &&
      (await this.#requiresBootstrap(input.since, latest, storeId))
    ) {
      return ok({
        storeId,
        records: [],
        events: [],
        seq: input.since,
        more: false,
        bootstrapRequired: true,
      });
    }
    return ok({
      ...storedPage(this.#options.storage, {
        after: input.since,
        through: input.through ?? latest,
        limit: input.limit,
      }),
      storeId,
    });
  }
}
