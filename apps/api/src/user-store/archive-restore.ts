import { getTableName } from "drizzle-orm";

import { err, ok, type Result } from "@pace/core";

import type { ActorStorage } from "../shared/ports/actor-storage.ts";
import type { ArchiveStore } from "../shared/ports/archive-store.ts";
import type { SqliteDatabase } from "../shared/ports/sqlite.ts";
import type { ArchiveError } from "./archive-service.ts";
import type { ArchiveRecord } from "./archive-types.ts";
import type { Materialized } from "./state.ts";

import { type ArchiveSet, readArchiveHistory } from "./archive-history.ts";
import { rawIdentity } from "./archive-validation.ts";
import * as schema from "./schema.ts";
import { StateCache } from "./state-cache.ts";
import { ensureUsageAggregates } from "./usage-aggregates.ts";

const isEmpty = (storage: ActorStorage): boolean =>
  Object.values(schema).every(
    (table) =>
      storage.sql.exec(`SELECT 1 FROM "${getTableName(table)}" LIMIT 1`).toArray().length === 0,
  );
const writeEvent = (
  storage: ActorStorage,
  record: Extract<ArchiveRecord, { kind: "event" }>,
): void => {
  const { row } = record;
  storage.sql.exec(
    "INSERT INTO events (seq,id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES (?,?,?,?,?,?,?,?,?)",
    record.seq,
    row.id,
    row.type,
    row.occurredAt,
    row.recordedAt,
    row.deviceId,
    row.precision,
    row.source,
    row.payload,
  );
};
const writeRaw = (
  storage: ActorStorage,
  record: Exclude<ArchiveRecord, { kind: "event" }>,
): void => {
  const { row } = record;
  if (record.kind === "usage") {
    storage.sql.exec(
      "INSERT INTO usage_sessions (device_id,device_name,app,start_at,end_at) VALUES (?,?,?,?,?)",
      record.row.deviceId,
      record.row.deviceName,
      record.row.app,
      record.row.startAt,
      record.row.endAt,
    );
  } else {
    storage.sql.exec(
      "INSERT INTO phone_uses (device_id,start_at,end_at) VALUES (?,?,?)",
      row.deviceId,
      row.startAt,
      row.endAt,
    );
  }
  storage.sql.exec(
    "INSERT INTO _history_raw_revisions (kind,row_key,month,revision) VALUES (?,?,?,?)",
    record.kind,
    rawIdentity(record),
    row.startAt.slice(0, 7),
    record.revision,
  );
  storage.sql.exec(
    "INSERT INTO _history_archive_months (month,raw_revision) VALUES (?,?) ON CONFLICT(month) DO UPDATE SET raw_revision=max(raw_revision,excluded.raw_revision)",
    row.startAt.slice(0, 7),
    record.revision,
  );
};

type RestoreInput = {
  readonly set: ArchiveSet;
  readonly retainedComplement: readonly ArchiveRecord[];
  readonly archive: ArchiveStore;
  readonly target: {
    readonly storage: ActorStorage;
    readonly db: SqliteDatabase<"sync", typeof schema>;
    readonly owner: string;
    readonly isolated: boolean;
  };
  readonly now: string;
};
/** Internal recovery rehearsal only: an explicit isolated empty actor, never append/derive or HTTP. */
export const restoreArchiveSet = async (
  input: RestoreInput,
): Promise<Result<Materialized, ArchiveError>> => {
  const { target } = input;
  if (
    !target.isolated ||
    target.owner === input.set.owner ||
    !target.owner.startsWith("restore:") ||
    !isEmpty(target.storage)
  ) {
    return err("archive/invalid");
  }
  const verified = await readArchiveHistory(input);
  if (!verified.ok) {
    return verified;
  }
  const isInstalled = target.storage.transactionSync(() => {
    if (!isEmpty(target.storage)) {
      return false;
    }
    for (const record of verified.value) {
      if (record.kind === "event") {
        writeEvent(target.storage, record);
      } else {
        writeRaw(target.storage, record);
      }
    }
    target.storage.sql.exec(
      "INSERT INTO _history_raw_state (id,revision) VALUES (1,?)",
      input.set.rawRevision,
    );
    return true;
  });
  if (!isInstalled) {
    return err("archive/invalid");
  }
  await target.storage.put("storeId", input.set.storeId);
  const cache = new StateCache({
    db: target.db,
    storage: target.storage,
    build: `${input.set.sourceSchemaTag}:isolated-restore`,
    isNamed: true,
    checkpointMode: "active",
    now: () => input.now,
  });
  const rebuilt = await cache.current();
  target.storage.transactionSync(() => {
    ensureUsageAggregates(target.storage, {
      storeId: input.set.storeId,
      zone: rebuilt.state.settings.timezone ?? "Europe/Moscow",
      now: input.now,
    });
  });
  return ok(rebuilt);
};
