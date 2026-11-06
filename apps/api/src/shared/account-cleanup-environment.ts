import type { Db } from "./db/d1.ts";
import type { ArchiveStore } from "./ports/archive-store.ts";
import type { KeyValue } from "./ports/key-value.ts";
import type { UserStoreRpc } from "./ports/user-store-host.ts";

export type CleanupActor = Pick<
  UserStoreRpc,
  "beginCleanup" | "endLiveSessions" | "finishCleanup" | "resetForCleanup"
>;
export type CleanupEnvironment = {
  readonly DB: Db;
  readonly OAUTH_KV: KeyValue;
  readonly USER_STORE: { readonly of: (userId: string) => CleanupActor };
  readonly HISTORY_ARCHIVE?: ArchiveStore;
};
