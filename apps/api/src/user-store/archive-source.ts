import type { ActorStorage } from "../shared/ports/actor-storage.ts";
import type { ArchiveRecord } from "./archive-types.ts";

import { rawIdentity } from "./archive-validation.ts";

export type ArchiveSource = {
  readonly sourceHighSeq: number;
  readonly rawRevision: number;
  readonly records: readonly ArchiveRecord[];
};
export type MonthFingerprint = { readonly eventSeq: number; readonly monthRawRevision: number };

export const sourceCursor = (
  storage: ActorStorage,
): { readonly seq: number; readonly revision: number } => {
  const [event] = storage.sql
    .exec<{ seq: null | number }>("SELECT max(seq) AS seq FROM events")
    .toArray();
  const [raw] = storage.sql
    .exec<{ revision: number }>("SELECT revision FROM _history_raw_state WHERE id = 1")
    .toArray();
  return { seq: event?.seq ?? 0, revision: raw?.revision ?? 0 };
};

export const monthFingerprint = (storage: ActorStorage, month: string): MonthFingerprint => {
  const [event] = storage.sql
    .exec<{ seq: null | number }>(
      "SELECT max(seq) AS seq FROM events WHERE substr(occurred_at,1,7) = ?",
      month,
    )
    .toArray();
  const [raw] = storage.sql
    .exec<{ revision: number }>(
      "SELECT raw_revision AS revision FROM _history_archive_months WHERE month = ?",
      month,
    )
    .toArray();
  return { eventSeq: event?.seq ?? 0, monthRawRevision: raw?.revision ?? 0 };
};

const rawRecords = (storage: ActorStorage, month?: string): readonly ArchiveRecord[] => {
  type PhoneRow = Extract<ArchiveRecord, { kind: "phone-use" }>["row"];
  type UsageRow = Extract<ArchiveRecord, { kind: "usage" }>["row"];
  const revisionRows = storage.sql.exec<{ kind: string; row_key: string; revision: number }>(
    "SELECT kind, row_key, revision FROM _history_raw_revisions",
  );
  const revisions = new Map<string, number>(
    Iterator.from(revisionRows).map((row): readonly [string, number] => [
      `${row.kind}:${row.row_key}`,
      row.revision,
    ]),
  );
  const where = month === undefined ? "" : " WHERE substr(start_at,1,7) = ?";
  const args = month === undefined ? [] : [month];
  const usage = storage.sql
    .exec<UsageRow>(
      `SELECT device_id AS deviceId, device_name AS deviceName, app, start_at AS startAt, end_at AS endAt FROM usage_sessions${where}`,
      ...args,
    )
    .toArray();
  const phones = storage.sql
    .exec<PhoneRow>(
      `SELECT device_id AS deviceId, start_at AS startAt, end_at AS endAt FROM phone_uses${where}`,
      ...args,
    )
    .toArray();
  const records: Exclude<ArchiveRecord, { kind: "event" }>[] = [
    ...usage.map((row) => ({ kind: "usage" as const, row, revision: 0 })),
    ...phones.map((row) => ({ kind: "phone-use" as const, row, revision: 0 })),
  ];
  return records.map((record) => ({
    ...record,
    revision: revisions.get(`${record.kind}:${rawIdentity(record)}`) ?? 0,
  }));
};

/** Captures immutable raw envelopes and mutable raw rows under one synchronous SQLite snapshot. */
export const captureArchiveSource = (storage: ActorStorage, month?: string): ArchiveSource =>
  storage.transactionSync(() => {
    type EventRow = Extract<ArchiveRecord, { kind: "event" }>["row"] & { seq: number };
    const cursor = sourceCursor(storage);
    const where = month === undefined ? "" : " AND substr(occurred_at,1,7) = ?";
    const args = month === undefined ? [cursor.seq] : [cursor.seq, month];
    const rows = storage.sql
      .exec<EventRow>(
        `SELECT seq,id,type,occurred_at AS occurredAt,recorded_at AS recordedAt,device_id AS deviceId,precision,source,payload FROM events WHERE seq <= ?${where} ORDER BY seq`,
        ...args,
      )
      .toArray();
    const events: ArchiveRecord[] = rows.map(({ seq, ...row }) => ({ kind: "event", seq, row }));
    return {
      sourceHighSeq: cursor.seq,
      rawRevision: cursor.revision,
      records: [...events, ...rawRecords(storage, month)],
    };
  });

export const archiveSourceMonths = (storage: ActorStorage): readonly string[] => {
  const rows = storage.sql.exec<{ month: string }>(
    "SELECT substr(occurred_at,1,7) AS month FROM events UNION SELECT substr(start_at,1,7) AS month FROM usage_sessions UNION SELECT substr(start_at,1,7) AS month FROM phone_uses ORDER BY month",
  );
  return Iterator.from(rows)
    .map((row) => row.month)
    .toArray();
};
