import { type Event, isCorrection, type Result } from "@pace/core";

import type { CleanupError } from "../shared/account-cleanup-types.ts";
import type {
  CheckpointBootstrap,
  HistoryPull,
  HistoryPullError,
  HistoryPullInput,
} from "../shared/history-sync-types.ts";
import type { AppBindings } from "../shared/ports/bindings.ts";
import type { ActorContext } from "../shared/ports/live-channel.ts";
import type { SqliteDatabase } from "../shared/ports/sqlite.ts";
import type * as schema from "./schema.ts";

import { historyCheckpointModeOf, UNNAMED_VERSION, versionOf } from "../shared/config.ts";
import { ArchiveService } from "./archive-service.ts";
import { CleanupFence, hasArchiveEvidence } from "./cleanup-fence.ts";
import { CloudStore } from "./cloud-store.ts";
import { HistorySync } from "./history-sync.ts";
import { StateCache } from "./state-cache.ts";
import { resetStore, SCHEMA_TAG, storeIdOf } from "./store-identity.ts";
import { ensureUsageAggregates } from "./usage-aggregates.ts";

type Db = SqliteDatabase<"sync", typeof schema>;

/** History acceleration and cleanup share one generation-bound lifecycle around the source store. */
export abstract class HistoryStore extends CloudStore {
  readonly #archive: ArchiveService;
  readonly #history: HistorySync;
  readonly #migrate: () => Promise<void>;
  protected readonly state: StateCache;
  protected readonly cleanup: CleanupFence;
  /** Checkpoint sync is offered to clients: live announcements carry stored records. */
  protected readonly checkpointsActive: boolean;
  readonly db: Db;
  readonly ready: Promise<void>;
  readonly assertAvailable = async (): Promise<void> => {
    await this.cleanup.assertWritable();
  };
  protected override readonly assertCloudWritable = async (): Promise<void> => {
    await this.ready;
    await this.cleanup.assertWritable();
  };
  /** A zone change (or a correction that may undo one) re-keys the archive's daily totals. */
  protected readonly refreshUsageZone = async (
    events: readonly Event[],
    now: string,
  ): Promise<void> => {
    if (
      this.env.HISTORY_ARCHIVE !== undefined &&
      events.some(
        (event) =>
          isCorrection(event) ||
          (event.type === "settings.updated" && event.payload.timezone !== undefined),
      )
    ) {
      await this.#refreshUsageAggregates(now);
    }
  };

  constructor(
    ctx: ActorContext,
    env: AppBindings,
    options: { readonly db: Db; readonly migrate: () => Promise<void> },
  ) {
    super(ctx, env);
    this.db = options.db;
    this.#migrate = options.migrate;
    this.cleanup = new CleanupFence({
      storage: ctx.storage,
      db: env.DB,
      owner: ctx.id.name,
      migrate: options.migrate,
      hasArchive: env.HISTORY_ARCHIVE !== undefined,
    });
    this.#archive = new ArchiveService({
      storage: ctx.storage,
      ...(env.HISTORY_ARCHIVE !== undefined && { archive: env.HISTORY_ARCHIVE }),
      owner: ctx.id.name,
      sourceSchemaTag: SCHEMA_TAG,
      canWrite: () => this.cleanup.canWrite(),
    });
    const version = versionOf(env.PACE_VERSION);
    const build = `${version}+${SCHEMA_TAG}`;
    const mode = historyCheckpointModeOf(env.PACE_HISTORY_CHECKPOINT_MODE);
    this.state = new StateCache({
      build,
      isNamed: version !== UNNAMED_VERSION,
      db: this.db,
      storage: ctx.storage,
      checkpointMode: mode,
    });
    // What `GET /api/instance` offers clients as `historyCheckpoint` (app.ts): the same rule.
    this.checkpointsActive = version !== UNNAMED_VERSION && mode === "active";
    this.#history = this.#createHistory({ build, isEnabled: this.checkpointsActive });
    // eslint-disable-next-line sonarjs/no-async-constructor -- blockConcurrencyWhile initializes migrations and the cleanup fence before any hosted call
    this.ready = ctx.blockConcurrencyWhile(async () => {
      await this.cleanup.open();
      await this.#archive.schedule();
    });
  }

  #createHistory(options: { readonly build: string; readonly isEnabled: boolean }): HistorySync {
    return new HistorySync({
      ...options,
      storage: this.ctx.storage,
      db: this.db,
      current: async () => await this.state.current(),
      checkpointPublished: (checkpoint) => {
        this.state.checkpointPublished(checkpoint);
      },
    });
  }

  async #refreshUsageAggregates(now: string): Promise<void> {
    if (
      this.ctx.storage.sql
        .exec("SELECT 1 FROM usage_sessions UNION ALL SELECT 1 FROM phone_uses LIMIT 1")
        .toArray().length === 0
    ) {
      return;
    }
    const context = {
      storeId: await storeIdOf(this.ctx.storage),
      zone: await this.state.zone(),
      now,
    };
    this.ctx.storage.transactionSync(() => {
      ensureUsageAggregates(this.ctx.storage, context);
    });
  }

  async wipe(): Promise<void> {
    await this.ready;
    await this.cleanup.assertWritable();
    if (await hasArchiveEvidence(this.ctx.storage)) {
      throw new Error("cleanup/invalid");
    }
    this.state.forget();
    await resetStore(this.ctx.storage, this.#migrate);
  }

  async beginCleanup(
    operationId: string,
  ): Promise<
    Result<{ readonly sourceStoreId: string; readonly archiveRequired: boolean }, CleanupError>
  > {
    return await this.cleanup.begin(operationId);
  }
  async resetForCleanup(input: {
    readonly operationId: string;
    readonly expectedStoreId: string;
  }): Promise<Result<{ readonly storeId: string }, CleanupError>> {
    const reset = await this.cleanup.reset(input);
    if (reset.ok) {
      this.state.forget();
    }
    return reset;
  }
  async finishCleanup(operationId: string): Promise<Result<void, CleanupError>> {
    return await this.cleanup.finish(operationId);
  }
  async archiveHistory(now: string): Promise<void> {
    if (this.env.HISTORY_ARCHIVE === undefined) {
      return;
    }
    await this.#refreshUsageAggregates(now);
    await this.#archive.atAlarm(now, await this.state.zone());
  }
  async bootstrap(limit: number): Promise<CheckpointBootstrap> {
    return await this.#history.bootstrap(limit);
  }
  async pull(input: HistoryPullInput): Promise<Result<HistoryPull, HistoryPullError>> {
    return await this.#history.pull(input);
  }
}
