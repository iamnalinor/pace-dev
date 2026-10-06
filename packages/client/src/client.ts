/** Public surface of @pace/client: the local-first store, sync, auth and their ports. */
export { createMemoryEventStore } from "./adapters/memory-event-store.ts";
export { type ApiClient, ApiError, createApiClient } from "./api-client.ts";
export {
  type Auth,
  type AuthState,
  type BotLogin,
  type BotLoginError,
  createAuth,
} from "./auth.ts";
export type { EventStore } from "./event-store.ts";
export { createMemorySessionStore, type SessionStore } from "./session.ts";
export {
  type AppState,
  type AppStateHandle,
  createAppState,
  type DispatchInput,
  rootReducer,
} from "./state.ts";
export {
  createSyncClient,
  type SyncClient,
  type SyncStatus,
  type SyncSummary,
} from "./sync-client.ts";
