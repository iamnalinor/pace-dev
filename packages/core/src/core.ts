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
export { settingsReducer } from "./materialize/settings-reducer.ts";
export { DEFAULT_SETTINGS, type Settings } from "./model/settings.ts";
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
