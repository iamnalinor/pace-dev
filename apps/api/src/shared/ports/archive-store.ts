import type { Result } from "@pace/core";

export type ArchiveIoError = "archive/unavailable";

/** Immutable object storage. Existing-key bytes are verified by the domain caller. */
export type ArchiveStore = {
  readonly putIfAbsent: (
    key: string,
    bytes: Uint8Array,
  ) => Promise<Result<"created" | "exists", ArchiveIoError>>;
  readonly get: (key: string) => Promise<Result<null | Uint8Array, ArchiveIoError>>;
  readonly list: (input: {
    readonly prefix: string;
    readonly cursor?: string;
    readonly limit: number;
  }) => Promise<
    Result<{ readonly keys: readonly string[]; readonly cursor?: string }, ArchiveIoError>
  >;
  readonly delete: (key: string) => Promise<Result<void, ArchiveIoError>>;
};
