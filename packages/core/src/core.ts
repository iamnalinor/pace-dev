/** Public surface of @pace/core. Everything here is pure: no I/O, no platform APIs. */
export {
  type ApiProblem,
  buildPath,
  endpoint,
  type EndpointInput,
  type EndpointOutput,
  type EndpointShape,
  type HttpMethod,
} from "./api/endpoint.ts";
export { endpointList, endpoints } from "./api/endpoints.ts";
export {
  AuthSessionSchema,
  DevLoginSchema,
  LogoutSchema,
  NonceCreatedSchema,
  NoncePollSchema,
  type TelegramLogin,
  TelegramLoginSchema,
  type User,
  UserSchema,
} from "./api/schemas/auth.ts";
export {
  grantedScopes,
  type GrantScopesError,
  OAUTH_SCOPES,
  type OAuthClientInfo,
  OAuthClientInfoQuerySchema,
  OAuthClientInfoSchema,
  OAuthCompleteBodySchema,
  OAuthDenyBodySchema,
  type OAuthGrant,
  OAuthGrantRevokedSchema,
  OAuthGrantSchema,
  OAuthGrantsSchema,
  OAuthRedirectSchema,
  type OAuthScope,
  OAuthScopeSchema,
  requestedScopes,
} from "./api/schemas/oauth.ts";
export {
  type Observation,
  ObservationSchema,
  type SyncEvent,
  SyncEventSchema,
  SyncObservationsBodySchema,
  SyncObservationsOutputSchema,
  SyncPullOutputSchema,
  SyncPullQuerySchema,
  SyncPushBodySchema,
  SyncPushOutputSchema,
} from "./api/schemas/sync.ts";
export { contrastRatio, parseHex, relativeLuminance, type Rgb } from "./design/contrast.ts";
export {
  type Palette,
  type PaletteName,
  type ProjectColorName,
  type RadiusName,
  type ThemeName,
  THEMES,
  type Tokens,
  tokens,
} from "./design/tokens.ts";
export {
  type Event,
  EVENT_TYPES,
  EventIdSchema,
  type EventInput,
  type EventOf,
  EventSchema,
  type EventType,
  parseEvent,
  PrecisionSchema,
  SourceSchema,
} from "./events/event-schema.ts";
export {
  CloseOutcomeSchema,
  ImportanceSchema,
  InstantSchema,
  ProjectColorSchema,
  SubtaskSchema,
  TaskFieldsSchema,
  TaskStatusSchema,
  TimeZoneSchema,
} from "./events/payloads.ts";
export { sortEvents } from "./events/sort.ts";
export { en } from "./i18n/en.ts";
export {
  formatDuration,
  formatRelativeDay,
  type Language,
  LANGUAGES,
  type MessageKey,
  type MessageParams,
  plural,
  type PluralForms,
  type RelativeDayContext,
  t,
} from "./i18n/i18n.ts";
export { ru } from "./i18n/ru.ts";
export {
  autoOutcomeId,
  type AutoOutcomeKind,
  createIdFactory,
  type IdFactory,
  instanceId,
  isUlid,
  newId,
  type Prng,
} from "./ids.ts";
export {
  apply,
  effectiveEvents,
  isCorrection,
  materialize,
  materializeAt,
  type MaterializeOptions,
  type Reducer,
  shouldRematerialize,
} from "./materialize/materializer.ts";
export { projectReducer } from "./materialize/project-reducer.ts";
export { settingsReducer } from "./materialize/settings-reducer.ts";
export { taskReducer } from "./materialize/task-reducer.ts";
export {
  type NotifyParams,
  type Preset,
  type PresetDefinition,
  type PresetFields,
  type ProgressMode,
  type Recurrence,
  type ResolvedPreset,
  type Submission,
  type Weekday,
  type WeekSlot,
} from "./model/preset.ts";
export {
  findProjectByName,
  INITIAL_PROJECTS_STATE,
  type Project,
  projectById,
  type ProjectsState,
} from "./model/project.ts";
export { DEFAULT_SETTINGS, type Settings } from "./model/settings.ts";
export {
  type CloseOutcome,
  type Closure,
  INITIAL_TASKS_STATE,
  isOpen,
  progressOf,
  solvedCount,
  submittedCount,
  type Subtask,
  type Task,
  taskById,
  type TaskFields,
  type TaskSource,
  type TasksState,
  type TaskStatus,
  unsubmittedSubtasks,
} from "./model/task.ts";
export {
  autoOutcomeEvents,
  type AutoOutcomeInput,
  type Deadline,
  deadlineOf,
  NOT_ASSIGNED_REASON,
  type Outcome,
  subtaskOutcome,
  type SubtaskOutcome,
  taskOutcome,
} from "./outcomes/outcome.ts";
export {
  BASE_PRESET_IDS,
  BASE_PRESETS,
  type BasePreset,
  type BasePresetId,
  isBuiltInPreset,
} from "./presets/base-presets.ts";
export {
  EXAMPLE_PRESET_IDS,
  exampleCoursePresetEvents,
  type ExamplePresetId,
} from "./presets/example-presets.ts";
export {
  INITIAL_PRESETS_STATE,
  presetById,
  presetReducer,
  type PresetsState,
} from "./presets/preset-reducer.ts";
export {
  parsePresetDefinition,
  PresetDefinitionSchema,
  PresetIdSchema,
} from "./presets/preset-schema.ts";
export { dueWeekOffset } from "./presets/recurrence.ts";
export {
  presetChain,
  type PresetError,
  type PresetInput,
  type PresetInputMode,
  type PresetValidationError,
  resolvePreset,
  validatePresetInput,
} from "./presets/resolve-preset.ts";
export { err, ok, type Result } from "./result.ts";
export {
  addMinutesIso,
  endOfDayIn,
  formatInZone,
  isoWeekKey,
  isValidTimeZone,
  minutesBetween,
  startOfDayIn,
  startOfWeekIn,
  type ZonedInstant,
  zonesDiffer,
} from "./time.ts";
export {
  AGE_SAT,
  AGE_TAU_DAYS,
  LAG_GAIN,
  MULTIPLIERS,
  PACE_MIN_HOURS,
  PRIORITIZED_HORIZON_DAYS,
  RANK_BONUS,
  RESUBMISSION_GROWTH_PER_DAY,
  U_FLOOR,
  U_MAX,
} from "./urgency/constants.ts";
export { explain, type Explanation } from "./urgency/explain.ts";
export {
  type DeadlinePolicy,
  type Importance,
  type UrgencyInput,
  type UrgencyPolicy,
  type WorkLeft,
} from "./urgency/input.ts";
export { age, lag, pace, resubmission } from "./urgency/policies.ts";
export {
  compareScores,
  effectiveDue,
  type Ranked,
  type Score,
  scoreTask,
  type TieBreak,
} from "./urgency/score.ts";
export {
  type ExplainInput,
  type ExplainKey,
  type ExplainStep,
  type ExplainUnit,
} from "./urgency/trace.ts";
export {
  FUTURE_TOLERANCE_MINUTES,
  type RetroError,
  validateEventInput,
  type ValidationState,
} from "./validation/retro-rules.ts";
