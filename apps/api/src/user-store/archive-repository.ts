import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

import type { ActorStorage } from "../shared/ports/actor-storage.ts";

import { type MonthFingerprint, monthFingerprint, sourceCursor } from "./archive-source.ts";
import {
  type ArchiveManifest,
  ArchiveManifestSchema,
  type PreparedArchiveMonth,
} from "./archive-types.ts";

const CHUNK_BYTES = 65_536;
const OperationSchema = z.object({
  id: z.string(),
  owner: z.string(),
  store_id: z.string(),
  month: z.string(),
  source_schema_tag: z.string(),
  captured_through_seq: z.number(),
  raw_revision: z.number(),
  event_seq: z.number(),
  month_raw_revision: z.number(),
  stage: z.enum(["prepared", "uploaded", "verified", "committed"]),
  manifest: z.string(),
  manifest_key: z.string(),
  attempts: z.number(),
  next_attempt_at: z.number(),
  error: z.string().nullable(),
});
export type ArchiveOperation = {
  readonly id: string;
  readonly stage: "committed" | "prepared" | "uploaded" | "verified";
  readonly prepared: PreparedArchiveMonth;
  readonly fingerprint: MonthFingerprint;
  readonly attempts: number;
  readonly nextAttemptAt: number;
};

const parseManifest = (text: string) => {
  try {
    return ArchiveManifestSchema.safeParse(JSON.parse(text));
  } catch {
    return ArchiveManifestSchema.safeParse(undefined);
  }
};

const isMatchingManifest = (
  manifest: ArchiveManifest,
  row: z.output<typeof OperationSchema>,
): boolean =>
  manifest.owner === row.owner &&
  manifest.storeId === row.store_id &&
  manifest.month === row.month &&
  manifest.capturedThroughSeq === row.captured_through_seq &&
  manifest.rawRevision === row.raw_revision &&
  manifest.sourceSchemaTag === row.source_schema_tag;

/** The exact staged bytes survive every external await and actor restart. */
export class ArchiveRepository {
  readonly #storage: ActorStorage;
  constructor(storage: ActorStorage) {
    this.#storage = storage;
  }

  #bytes(id: string, size: number): Uint8Array | undefined {
    const chunks = this.#storage.sql
      .exec<{ chunk: number; data: ArrayBuffer }>(
        "SELECT chunk,data FROM _history_archive_chunks WHERE operation_id = ? ORDER BY chunk",
        id,
      )
      .toArray();
    if (
      chunks.length !== Math.ceil(size / CHUNK_BYTES) ||
      chunks.some(
        (chunk, index) =>
          chunk.chunk !== index ||
          !(chunk.data instanceof ArrayBuffer) ||
          chunk.data.byteLength !== Math.min(CHUNK_BYTES, size - index * CHUNK_BYTES),
      )
    ) {
      return undefined;
    }
    const bytes = new Uint8Array(size);
    for (const chunk of chunks) {
      bytes.set(new Uint8Array(chunk.data), chunk.chunk * CHUNK_BYTES);
    }
    return bytes;
  }

  load(id: string): Result<ArchiveOperation | undefined, "archive/integrity"> {
    const [row] = this.#storage.sql
      .exec("SELECT * FROM _history_archive_operations WHERE id = ?", id)
      .toArray();
    if (row === undefined) {
      return ok(undefined);
    }
    const parsed = OperationSchema.safeParse(row);
    if (!parsed.success) {
      return err("archive/integrity");
    }
    const value = parsed.data;
    const manifest = parseManifest(value.manifest);
    if (!manifest.success) {
      return err("archive/integrity");
    }
    const bytes = this.#bytes(id, manifest.data.compressedByteLength);
    if (bytes === undefined || !isMatchingManifest(manifest.data, value)) {
      return err("archive/integrity");
    }
    return ok({
      id,
      stage: value.stage,
      attempts: value.attempts,
      nextAttemptAt: value.next_attempt_at,
      fingerprint: { eventSeq: value.event_seq, monthRawRevision: value.month_raw_revision },
      prepared: {
        manifest: manifest.data,
        manifestKey: value.manifest_key,
        manifestBytes: new TextEncoder().encode(value.manifest),
        bytes,
      },
    });
  }

  matching(
    month: string,
    input: MonthFingerprint & { readonly schema: string },
  ): Result<ArchiveOperation | undefined, "archive/integrity"> {
    const [row] = this.#storage.sql
      .exec<{ id: string }>(
        "SELECT id FROM _history_archive_operations WHERE month = ? AND event_seq = ? AND month_raw_revision = ? AND source_schema_tag = ? ORDER BY rowid DESC LIMIT 1",
        month,
        input.eventSeq,
        input.monthRawRevision,
        input.schema,
      )
      .toArray();
    return row === undefined ? ok(undefined) : this.load(row.id);
  }

  prepare(id: string, prepared: PreparedArchiveMonth, fingerprint: MonthFingerprint): boolean {
    return this.#storage.transactionSync(() => {
      const cursor = sourceCursor(this.#storage);
      const manifest = prepared.manifest;
      if (cursor.seq !== manifest.capturedThroughSeq || cursor.revision !== manifest.rawRevision) {
        return false;
      }
      this.#storage.sql.exec(
        "INSERT INTO _history_archive_operations (id,owner,store_id,month,source_schema_tag,captured_through_seq,raw_revision,event_seq,month_raw_revision,stage,manifest,manifest_key,attempts,next_attempt_at) VALUES (?,?,?,?,?,?,?,?,?,'prepared',?,?,0,0) ON CONFLICT(id) DO NOTHING",
        id,
        manifest.owner,
        manifest.storeId,
        manifest.month,
        manifest.sourceSchemaTag,
        manifest.capturedThroughSeq,
        manifest.rawRevision,
        fingerprint.eventSeq,
        fingerprint.monthRawRevision,
        new TextDecoder().decode(prepared.manifestBytes),
        prepared.manifestKey,
      );
      for (let offset = 0; offset < prepared.bytes.byteLength; offset += CHUNK_BYTES) {
        this.#storage.sql.exec(
          "INSERT INTO _history_archive_chunks (operation_id,chunk,data) VALUES (?,?,?) ON CONFLICT DO NOTHING",
          id,
          offset / CHUNK_BYTES,
          Uint8Array.from(prepared.bytes.slice(offset, offset + CHUNK_BYTES)).buffer,
        );
      }
      return true;
    });
  }

  stage(id: string, stage: ArchiveOperation["stage"]): void {
    this.#storage.sql.exec(
      "UPDATE _history_archive_operations SET stage = ?, error = NULL, next_attempt_at = 0 WHERE id = ?",
      stage,
      id,
    );
  }

  commit(operation: ArchiveOperation): void {
    this.#storage.transactionSync(() => {
      const { manifest, manifestKey } = operation.prepared;
      this.#storage.sql.exec(
        "INSERT INTO _history_archive_manifests (operation_id,manifest_key,month,manifest) VALUES (?,?,?,?) ON CONFLICT DO NOTHING",
        operation.id,
        manifestKey,
        manifest.month,
        JSON.stringify(manifest),
      );
      const current = monthFingerprint(this.#storage, manifest.month);
      if (
        current.eventSeq === operation.fingerprint.eventSeq &&
        current.monthRawRevision === operation.fingerprint.monthRawRevision
      ) {
        this.#storage.sql.exec(
          "INSERT INTO _history_archive_months (month,raw_revision,active_operation_id) VALUES (?,?,?) ON CONFLICT(month) DO UPDATE SET active_operation_id=excluded.active_operation_id, blocked_fingerprint=NULL, blocked_error=NULL",
          manifest.month,
          current.monthRawRevision,
          operation.id,
        );
      }
      this.stage(operation.id, "committed");
    });
  }

  retry(operation: ArchiveOperation, error: string, now: string): number {
    const next =
      Date.parse(now) + Math.min(3_600_000, 60_000 * 2 ** Math.min(operation.attempts, 6));
    this.#storage.sql.exec(
      "UPDATE _history_archive_operations SET attempts=attempts+1,next_attempt_at=?,error=? WHERE id=?",
      next,
      error,
      operation.id,
    );
    return next;
  }

  block(month: string, fingerprint: string, error: string): void {
    this.#storage.sql.exec(
      "INSERT INTO _history_archive_months (month,raw_revision,blocked_fingerprint,blocked_error) VALUES (?,0,?,?) ON CONFLICT(month) DO UPDATE SET blocked_fingerprint=excluded.blocked_fingerprint,blocked_error=excluded.blocked_error",
      month,
      fingerprint,
      error,
    );
  }

  isCurrent(
    input: MonthFingerprint & {
      readonly month: string;
      readonly schema: string;
      readonly owner: string;
      readonly storeId: string;
    },
  ): boolean {
    return (
      this.#storage.sql
        .exec(
          "SELECT 1 FROM _history_archive_months AS m JOIN _history_archive_operations AS o ON o.id=m.active_operation_id WHERE m.month=? AND o.stage='committed' AND o.event_seq=? AND o.month_raw_revision=? AND o.source_schema_tag=? AND o.owner=? AND o.store_id=? LIMIT 1",
          input.month,
          input.eventSeq,
          input.monthRawRevision,
          input.schema,
          input.owner,
          input.storeId,
        )
        .toArray().length > 0
    );
  }

  isBlocked(month: string, fingerprint: string): boolean {
    const [row] = this.#storage.sql
      .exec<{ blocked_fingerprint: null | string }>(
        "SELECT blocked_fingerprint FROM _history_archive_months WHERE month=?",
        month,
      )
      .toArray();
    return row?.blocked_fingerprint === fingerprint;
  }

  due(now: string): readonly string[] {
    return Iterator.from(
      this.#storage.sql.exec<{ id: string }>(
        "SELECT id FROM _history_archive_operations WHERE stage <> 'committed' AND next_attempt_at <= ? ORDER BY next_attempt_at,id LIMIT 1",
        Date.parse(now),
      ),
    )
      .map((row) => row.id)
      .toArray();
  }

  selected(): readonly string[] {
    return Iterator.from(
      this.#storage.sql.exec<{ active_operation_id: string }>(
        "SELECT active_operation_id FROM _history_archive_months WHERE active_operation_id IS NOT NULL ORDER BY month",
      ),
    )
      .map((row) => row.active_operation_id)
      .toArray();
  }
}
