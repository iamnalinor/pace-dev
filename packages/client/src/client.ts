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
export {
  type ProjectActions,
  type ProjectDraft,
  projectNameError,
  type ProjectPatch,
} from "./actions/project-actions.ts";
export type { ProjectTarget } from "./actions/projects.ts";
export type { ReviewActions } from "./actions/review-actions.ts";
export type { QuietHours, SettingsActions } from "./actions/settings-actions.ts";
export type {
  CreateTaskForm,
  SubtaskForm,
  TaskActions,
  TaskFieldsForm,
  TaskPatch,
} from "./actions/task-actions.ts";
export type {
  ActivityEntry,
  ActivityInput,
  ActivityTarget,
  CalendarStart,
  PastActivity,
  StartOptions,
  StopWhen,
  TimeActions,
} from "./actions/time-actions.ts";
export type { CloseInput, SubmitInput, WorkActions } from "./actions/work-actions.ts";
export { createMemoryEventStore } from "./adapters/memory-event-store.ts";
export { type ApiClient, ApiError, createApiClient } from "./api-client.ts";
export type { AiOutcome, Assistant } from "./assistant.ts";
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
export {
  activityNotifications,
  calendarNotifications,
  type CalendarReminder,
  fetchNotificationPlan,
  isActivityId,
  isCalendarId,
  type LocalNotification,
  localNotifications,
  type RunningTimer,
  scheduleChanges,
  type ScheduleChanges,
} from "./local-notifications.ts";
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
export { type AiReading, aiReading } from "./view-models/ai-reading.ts";
export { type CalendarDay, monthGrid, monthOf, shiftMonth } from "./view-models/calendar.ts";
export { recentReasons } from "./view-models/close-reasons.ts";
export {
  canAiRead,
  type ComposerDraft,
  type ComposerEdits,
  composerModel,
  type ComposerModel,
  type ComposerOption,
  type ComposerTarget,
  isPasted,
  LONG_TEXT_CHARS,
  requiresAiFirst,
  taskFormOptions,
} from "./view-models/composer.ts";
export {
  type DayEntry,
  type DayModel,
  dayModel,
  type DayRow,
  type DayTotal,
  trackedDates,
} from "./view-models/day.ts";
export { decisionLabelKey } from "./view-models/decisions.ts";
export { type ExportCell, type ExportSheet, exportSheets } from "./view-models/export.ts";
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
  type FocusSleepRow,
  focusSleepRows,
  type FragmentationTile,
  fragmentationTiles,
  HOUR_TICKS,
  hourLabel,
} from "./view-models/insights-text.ts";
export {
  type InsightBar,
  type InsightsModel,
  insightsModel,
  type OnTimeView,
} from "./view-models/insights.ts";
export { type PlainMetaPart, plainMetaText } from "./view-models/meta-text.ts";
export {
  type MetaPart,
  type NowRow,
  nowRow,
  type NowViewModel,
  nowViewModel,
  type ProjectChip,
  type RowTag,
} from "./view-models/now.ts";
export { SCOPE_KEYS } from "./view-models/oauth-scopes.ts";
export {
  definitionIssues,
  editorDraft,
  inheritedOf,
  isOverridden,
  isSubOverridden,
  newDraft,
  type PresetDraft,
  setSub,
  setValue,
  slugify,
  type SubKey,
  toggleOverride,
  toggleSubOverride,
  type WholeKey,
} from "./view-models/preset-draft.ts";
export {
  presetPreview,
  type PresetPreviewModel,
  PREVIEW_SAMPLE,
  type PreviewContext,
} from "./view-models/preset-preview.ts";
export {
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
} from "./view-models/task.ts";
export {
  type ChoiceView,
  type MessageText,
  PACE_STATUS_TEXT,
  type RunningView,
  type TimeBarModel,
  timeBarModel,
  type TimeButtonView,
} from "./view-models/time-bar.ts";
export {
  type ActivityForm,
  activityFormOf,
  type ActivityRange,
  type ActivitySheetProps,
  type DayRowProps,
  type FormPartProps,
  hasEnd,
  type TypedTime,
  typeTime,
} from "./view-models/time-forms.ts";
