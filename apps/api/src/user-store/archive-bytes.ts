import { err, ok, type Result } from "@pace/core";

import type { ArchiveCodecError } from "./archive-types.ts";

export const ARCHIVE_MAX_BYTES = 16 * 1024 * 1024;

const joinChunks = (chunks: readonly Uint8Array[], size: number): Uint8Array => {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

/** Stream into bounded chunks; compressed inputs never get an unbounded Response.arrayBuffer(). */
const collect = async (
  stream: ReadableStream<Uint8Array>,
): Promise<Result<Uint8Array, ArchiveCodecError>> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let next = await reader.read();
  while (!next.done) {
    size += next.value.byteLength;
    if (size > ARCHIVE_MAX_BYTES) {
      await reader.cancel();
      return err("archive/too-large");
    }
    chunks.push(next.value);
    next = await reader.read();
  }
  return ok(joinChunks(chunks, size));
};

export const archiveCompression = async (
  bytes: Uint8Array,
  mode: "compress" | "decompress",
): Promise<Result<Uint8Array, ArchiveCodecError>> => {
  try {
    const stream = new Blob([Uint8Array.from(bytes).buffer]).stream();
    const transform =
      mode === "compress" ? new CompressionStream("gzip") : new DecompressionStream("gzip");
    return await collect(stream.pipeThrough(transform));
  } catch {
    return err("archive/integrity");
  }
};
