/** Public surface of @pace/client: the local-first store, actions, view-models, sync, auth and their ports. */
export { type Actions, type ActionsOptions, createActions } from "./actions/actions.ts";
export type { ComposerExtras } from "./actions/composer-actions.ts";
export type { ActionError, ActionResult, When } from "./actions/deps.ts";
export {
  defaultEstimateHints,
  ESTIMATE_BUCKET_MINUTES,
  type EstimateBucket,
  type EstimateHints,
  type EstimateSample,
} from "./actions/estimate-hints.ts";
export type { InboxActions } from "./actions/inbox-actions.ts";
export type { InstanceActions } from "./actions/instances.ts";
export type { PresetActions } from "./actions/preset-actions.ts";
export type { ProjectTarget } from "./actions/projects.ts";
export type { RankActions } from "./actions/rank-actions.ts";
export type { ReviewActions } from "./actions/review-actions.ts";
export type { QuietHours, SettingsActions } from "./actions/settings-actions.ts";
export type {
  CreateTaskForm,
  SubtaskForm,
  TaskActions,
  TaskFieldsForm,
  TaskPatch,
} from "./actions/task-actions.ts";
export type { CloseInput, SubmitInput, WorkActions } from "./actions/work-actions.ts";
export { createMemoryEventStore } from "./adapters/memory-event-store.ts";
export { type ApiClient, ApiError, createApiClient } from "./api-client.ts";
export {
  type Auth,
  type AuthState,
  type BotLogin,
  type BotLoginError,
  createAuth,
} from "./auth.ts";
export {
  type Clock,
  queryContext,
  type QuickTime,
  type QuickTimeKey,
  quickTimes,
  systemClock,
} from "./clock.ts";
export { createPaceClient, type PaceClient, type PaceClientOptions } from "./create-client.ts";
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
export { recentReasons } from "./view-models/close-reasons.ts";
export {
  type ComposerDraft,
  type ComposerEdits,
  composerModel,
  type ComposerModel,
  type ComposerOption,
  type ComposerTarget,
} from "./view-models/composer.ts";
export {
  type HistoryEntry,
  type HistoryOptions,
  type HistorySource,
  type HistoryViewModel,
  historyViewModel,
} from "./view-models/history.ts";
export {
  type InboxCard,
  type InboxChip,
  type InboxViewModel,
  inboxViewModel,
} from "./view-models/inbox.ts";
export {
  type MetaPart,
  type NowRow,
  nowRow,
  type NowViewModel,
  nowViewModel,
  type ProjectChip,
} from "./view-models/now.ts";
export {
  type AwaitingRow,
  type DoneRow,
  type ProjectViewModel,
  projectViewModel,
} from "./view-models/project.ts";
export { type DueRelative, relativeDay } from "./view-models/relative-day.ts";
export { type ReviewRow, type ReviewViewModel, reviewViewModel } from "./view-models/review.ts";
export {
  type OverrideSheet,
  type PrimaryAction,
  type ProblemRow,
  type ProblemState,
  type TaskLink,
  type TaskTag,
  type TaskViewModel,
  taskViewModel,
  type WhyRow,
} from "./view-models/task.ts";
