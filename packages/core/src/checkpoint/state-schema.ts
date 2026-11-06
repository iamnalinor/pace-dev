import { z } from "zod";

import type { CoreState } from "../materialize/core-state.ts";

import { SourceSchema } from "../events/event-schema.ts";
import {
  ACTIVITY_CATEGORIES,
  CloseOutcomeSchema,
  ImportanceSchema,
  InstantSchema,
  ProjectColorSchema,
  SeriesCreatedPayload,
  SettingsUpdatedPayload,
  TimeZoneSchema,
} from "../events/payloads.ts";
import { PresetDefinitionSchema } from "../presets/preset-schema.ts";

const nullableInstant = InstantSchema.nullable();
const nullableString = z.string().nullable();
const nonnegative = z.int().nonnegative();
const nullableMinutes = nonnegative.nullable();

const SubtaskSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  number: nonnegative.nullable(),
  solvedAt: nullableInstant,
  submittedAt: nullableInstant,
});
const TaskSourceSchema = z.strictObject({
  text: z.string(),
  url: nullableString,
  at: InstantSchema,
});

const TaskSchema = z.strictObject({
  id: z.string().min(1),
  createdEventId: z.string().min(1),
  title: z.string().min(1),
  presetId: z.string().min(1),
  seriesId: nullableString,
  seriesRevision: nonnegative.nullable(),
  userModified: z.boolean(),
  projectId: nullableString,
  importance: ImportanceSchema.nullable(),
  importanceSetAt: nullableInstant,
  dueAt: nullableInstant,
  dueTz: TimeZoneSchema.nullable(),
  startAt: nullableInstant,
  startTz: TimeZoneSchema.nullable(),
  estimateMinutes: nullableMinutes,
  subtasks: z.array(SubtaskSchema),
  slider: z.int().min(0).max(10).nullable(),
  description: nullableString,
  sourceText: nullableString,
  sources: z.array(TaskSourceSchema),
  fields: z.strictObject({ link: nullableString, submitVia: nullableString }),
  overrides: z.record(z.string(), z.json()).nullable(),
  status: z.enum(["not_started", "in_progress", "paused"]),
  statusSince: InstantSchema,
  touched: z.boolean(),
  createdAt: InstantSchema,
  submittedAt: nullableInstant,
  closed: z
    .strictObject({
      outcome: CloseOutcomeSchema,
      at: InstantSchema,
      reason: nullableString,
      source: SourceSchema,
      eventId: z.string().min(1),
      confirmed: z.boolean(),
    })
    .nullable(),
  reopenedAt: nullableInstant,
  lastEventAt: InstantSchema,
});

const ProjectSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  color: ProjectColorSchema.nullable(),
  description: nullableString,
  archived: z.boolean(),
  createdAt: InstantSchema,
});
const PresetSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  extends: nullableString,
  builtIn: z.boolean(),
  archived: z.boolean(),
  definition: PresetDefinitionSchema,
  createdAt: InstantSchema,
  order: z.int(),
});
const SeriesSchema = z.strictObject({
  id: z.string().min(1),
  template: SeriesCreatedPayload.shape.template,
  schedule: SeriesCreatedPayload.shape.schedule,
  revision: nonnegative,
  revisionKey: z.string().min(1),
  archived: z.boolean(),
  keepTaskId: nullableString,
  createdAt: InstantSchema,
});
const ActivitySchema = z.strictObject({
  id: z.string().min(1),
  originEventId: z.string().min(1),
  label: z.string().min(1),
  category: z.enum(ACTIVITY_CATEGORIES),
  taskId: nullableString,
  buttonId: nullableString,
  startAt: InstantSchema,
  endAt: nullableInstant,
  expectMinutes: nullableMinutes,
  isLogged: z.boolean(),
  isAlongside: z.boolean(),
  stillAt: nullableInstant,
});
const ChannelSwitchesSchema = z.strictObject({
  telegram: z.boolean(),
  app: z.boolean(),
  web: z.boolean(),
});
const SettingsSchema = z.strictObject({
  language: z.enum(["en", "ru"]),
  timezone: TimeZoneSchema.nullable(),
  digestWindows: SettingsUpdatedPayload.shape.digestWindows.unwrap(),
  quietHours: SettingsUpdatedPayload.shape.quietHours.unwrap(),
  nightHours: z.boolean(),
  categoryEstimates: z.partialRecord(z.enum(ACTIVITY_CATEGORIES), z.int().positive().max(1440)),
  notificationChannels: z.strictObject({
    login: ChannelSwitchesSchema,
    deadline_digest: ChannelSwitchesSchema,
    event_start: ChannelSwitchesSchema,
    activity_overrun: ChannelSwitchesSchema,
  }),
});

/** The map key is part of identity: a valid entity stored under another id is corrupt. */
const entityMap = <S extends z.ZodType<{ readonly id: string }>>(schema: S) =>
  z
    .record(z.string(), schema)
    .refine((entries) => Object.entries(entries).every(([id, entity]) => id === entity.id));
const slice = <S extends z.ZodType<{ readonly id: string }>>(schema: S) =>
  z.strictObject({ byId: entityMap(schema) });

/** Full serialized projection validation, without trusting persisted data as CoreState. */
export const CoreStateSchema = z.strictObject({
  tasks: slice(TaskSchema),
  projects: slice(ProjectSchema),
  presets: slice(PresetSchema),
  settings: SettingsSchema,
  time: z.strictObject({ activities: entityMap(ActivitySchema) }),
  series: slice(SeriesSchema),
}) satisfies z.ZodType<CoreState>;
