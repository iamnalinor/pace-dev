import { z } from "zod";

import { type Checkpoint, CHECKPOINT_VERSION, parseCheckpoint } from "@pace/core";

import type { ActorStorage } from "../shared/ports/actor-storage.ts";

import { sha256BytesHex } from "../shared/crypto.ts";
import { storeIdOf } from "./store-identity.ts";

type Expected = { readonly build: string; readonly storeId: string };
export type CheckpointRead =
  | { readonly kind: "absent" | "invalid" }
  | { readonly kind: "valid"; readonly checkpoint: Checkpoint };

const CHUNK_BYTES = 65_536;
const MetadataSchema = z.strictObject({
  id: z.literal(1),
  format: z.literal(CHECKPOINT_VERSION),
  build: z.string().min(1),
  store_id: z.string().min(1),
  covered_seq: z.int().nonnegative(),
  cutoff: z.string(),
  cutoff_timezone: z.string(),
  event_count: z.int().nonnegative(),
  byte_count: z.int().positive(),
  chunk_count: z.int().positive(),
  sha256: z.string().regex(/^[a-f\d]{64}$/u),
});
type Metadata = z.output<typeof MetadataSchema>;

const decode = (bytes: Uint8Array<ArrayBuffer>): unknown => {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
};

const isMatching = (checkpoint: Checkpoint, metadata: Metadata): boolean =>
  checkpoint.build === metadata.build &&
  checkpoint.storeId === metadata.store_id &&
  checkpoint.coveredSeq === metadata.covered_seq &&
  checkpoint.cutoff === metadata.cutoff &&
  checkpoint.cutoffTimezone === metadata.cutoff_timezone &&
  checkpoint.eventCount === metadata.event_count;

/** Bounded SQL values and atomic publication; cached corruption never replaces retained source. */
export class CheckpointRepository {
  readonly #storage: ActorStorage;

  constructor(storage: ActorStorage) {
    this.#storage = storage;
  }

  #bytes(metadata: Metadata): Uint8Array<ArrayBuffer> | undefined {
    const chunks = this.#storage.sql
      .exec<{ chunk: number; data: ArrayBuffer }>(
        "SELECT chunk, data FROM history_checkpoint_chunks ORDER BY chunk",
      )
      .toArray();
    if (
      chunks.length !== metadata.chunk_count ||
      metadata.chunk_count !== Math.ceil(metadata.byte_count / CHUNK_BYTES)
    ) {
      return undefined;
    }
    for (const [index, chunk] of chunks.entries()) {
      if (chunk.chunk !== index || !(chunk.data instanceof ArrayBuffer)) {
        return undefined;
      }
      const wanted = Math.min(CHUNK_BYTES, metadata.byte_count - index * CHUNK_BYTES);
      if (chunk.data.byteLength !== wanted) {
        return undefined;
      }
    }
    const bytes = new Uint8Array(metadata.byte_count);
    for (const chunk of chunks) {
      bytes.set(new Uint8Array(chunk.data), chunk.chunk * CHUNK_BYTES);
    }
    return bytes;
  }

  async read(expected: Expected): Promise<CheckpointRead> {
    const rows = this.#storage.sql.exec("SELECT * FROM history_checkpoint").toArray();
    if (rows.length === 0) {
      return { kind: "absent" };
    }
    const parsed = MetadataSchema.safeParse(rows[0]);
    if (
      rows.length !== 1 ||
      !parsed.success ||
      parsed.data.build !== expected.build ||
      parsed.data.store_id !== expected.storeId
    ) {
      return { kind: "invalid" };
    }
    const metadata = parsed.data;
    const bytes = this.#bytes(metadata);
    if (bytes === undefined || (await sha256BytesHex(bytes)) !== metadata.sha256) {
      return { kind: "invalid" };
    }
    const checkpoint = parseCheckpoint(decode(bytes));
    return checkpoint.ok && isMatching(checkpoint.value, metadata)
      ? { kind: "valid", checkpoint: checkpoint.value }
      : { kind: "invalid" };
  }

  async publish(checkpoint: Checkpoint, sourceSeq: number): Promise<boolean> {
    if (!parseCheckpoint(checkpoint).ok || checkpoint.coveredSeq > sourceSeq) {
      return false;
    }
    const bytes = new TextEncoder().encode(JSON.stringify(checkpoint));
    const sha256 = await sha256BytesHex(bytes);
    // Hashing can yield. Recheck the generation after it, immediately before synchronous publication.
    if ((await storeIdOf(this.#storage)) !== checkpoint.storeId) {
      return false;
    }
    return this.#storage.transactionSync(() => {
      const [source] = this.#storage.sql
        .exec<{ seq: null | number }>("SELECT max(seq) AS seq FROM events")
        .toArray();
      if ((source?.seq ?? 0) !== sourceSeq) {
        return false;
      }
      this.#storage.sql.exec("DELETE FROM history_checkpoint_chunks");
      this.#storage.sql.exec("DELETE FROM history_checkpoint");
      for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
        this.#storage.sql.exec(
          "INSERT INTO history_checkpoint_chunks (chunk, data) VALUES (?, ?)",
          offset / CHUNK_BYTES,
          bytes.slice(offset, offset + CHUNK_BYTES).buffer,
        );
      }
      this.#storage.sql.exec(
        "INSERT INTO history_checkpoint (id, format, build, store_id, covered_seq, cutoff, cutoff_timezone, event_count, byte_count, chunk_count, sha256) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        checkpoint.version,
        checkpoint.build,
        checkpoint.storeId,
        checkpoint.coveredSeq,
        checkpoint.cutoff,
        checkpoint.cutoffTimezone,
        checkpoint.eventCount,
        bytes.byteLength,
        Math.ceil(bytes.byteLength / CHUNK_BYTES),
        sha256,
      );
      return true;
    });
  }
}
