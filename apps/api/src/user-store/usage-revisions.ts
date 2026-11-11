import type { UsageUpload } from "../shared/contract.ts";
import type { ActorStorage } from "../shared/ports/actor-storage.ts";

import { type AggregateContext, updateUsageAggregates } from "./usage-aggregates.ts";

type Span = { readonly startAt: string; readonly endAt: string };
/** A raw row an upload actually changed: what the archive's revisions and totals follow. */
type Change = Span & { readonly kind: string; readonly key: string };
const isValid = (span: Span, canAllowZero: boolean): boolean => {
  const difference = Date.parse(span.endAt) - Date.parse(span.startAt);
  return Number.isFinite(difference) && (canAllowZero ? difference >= 0 : difference > 0);
};
const revisionOf = (storage: ActorStorage): number =>
  storage.sql
    .exec<{ revision: number }>(
      "INSERT INTO _history_raw_state (id,revision) VALUES (1,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1 RETURNING revision",
    )
    .toArray()[0]?.revision ?? 0;
const markChanged = (storage: ActorStorage, input: Change): void => {
  const revision = revisionOf(storage);
  const month = input.startAt.slice(0, 7);
  storage.sql.exec(
    "INSERT INTO _history_raw_revisions (kind,row_key,month,revision) VALUES (?,?,?,?) ON CONFLICT(kind,row_key) DO UPDATE SET revision=excluded.revision,month=excluded.month",
    input.kind,
    input.key,
    month,
    revision,
  );
  storage.sql.exec(
    "INSERT INTO _history_archive_months (month,raw_revision) VALUES (?,?) ON CONFLICT(month) DO UPDATE SET raw_revision=excluded.raw_revision,blocked_fingerprint=NULL,blocked_error=NULL",
    month,
    revision,
  );
};
const laterEnd = (before: string | undefined, incoming: string): string =>
  before === undefined || Date.parse(incoming) > Date.parse(before) ? incoming : before;

const writeSession = (
  storage: ActorStorage,
  upload: UsageUpload,
  session: UsageUpload["sessions"][number],
): readonly Change[] => {
  const [old] = storage.sql
    .exec<{ endAt: string; deviceName: string }>(
      "SELECT end_at AS endAt,device_name AS deviceName FROM usage_sessions WHERE device_id=? AND app=? AND start_at=?",
      upload.deviceId,
      session.app,
      session.startAt,
    )
    .toArray();
  const endAt = laterEnd(old?.endAt, session.endAt);
  if (old?.endAt === endAt && old.deviceName === upload.deviceName) {
    return [];
  }
  storage.sql.exec(
    "INSERT INTO usage_sessions (device_id,device_name,app,start_at,end_at) VALUES (?,?,?,?,?) ON CONFLICT(device_id,app,start_at) DO UPDATE SET device_name=excluded.device_name,end_at=excluded.end_at",
    upload.deviceId,
    upload.deviceName,
    session.app,
    session.startAt,
    endAt,
  );
  const key = JSON.stringify([upload.deviceId, session.app, session.startAt]);
  return [{ kind: "usage", key, startAt: session.startAt, endAt }];
};
const writePhone = (storage: ActorStorage, deviceId: string, use: Span): readonly Change[] => {
  const [old] = storage.sql
    .exec<{ endAt: string }>(
      "SELECT end_at AS endAt FROM phone_uses WHERE device_id=? AND start_at=?",
      deviceId,
      use.startAt,
    )
    .toArray();
  const endAt = laterEnd(old?.endAt, use.endAt);
  if (old?.endAt === endAt) {
    return [];
  }
  storage.sql.exec(
    "INSERT INTO phone_uses (device_id,start_at,end_at) VALUES (?,?,?) ON CONFLICT(device_id,start_at) DO UPDATE SET end_at=excluded.end_at",
    deviceId,
    use.startAt,
    endAt,
  );
  const key = JSON.stringify([deviceId, use.startAt]);
  return [{ kind: "phone-use", key, startAt: use.startAt, endAt }];
};

/**
Raw rows, revision evidence and derived totals either all commit or all roll back. Revisions and
totals exist only for an archive (`archive` given, the context its totals are kept in): without
one an upload writes its raw rows and nothing else.
*/
export const writeUsageWithRevisions = (
  storage: ActorStorage,
  upload: UsageUpload,
  archive: AggregateContext | undefined,
): number =>
  storage.transactionSync(() => {
    const sessions = upload.sessions.filter((session) => isValid(session, false));
    const uses = upload.isPhone ? (upload.uses ?? []).filter((use) => isValid(use, true)) : [];
    const changed = [
      ...sessions.flatMap((session) => writeSession(storage, upload, session)),
      ...uses.flatMap((use) => writePhone(storage, upload.deviceId, use)),
    ];
    if (archive !== undefined && changed.length > 0) {
      for (const change of changed) {
        markChanged(storage, change);
      }
      updateUsageAggregates(storage, archive, changed);
    }
    return sessions.length + uses.length;
  });
