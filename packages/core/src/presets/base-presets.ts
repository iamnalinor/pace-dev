import type { NotifyParams, Preset, PresetFields, ResolvedPreset } from "../model/preset.ts";

export const BASE_PRESET_IDS = ["hw", "work", "personal", "deferred", "inbox"] as const;

export type BasePresetId = (typeof BASE_PRESET_IDS)[number];

/** A built-in preset: its definition is complete, so every chain resolves from it. */
export type BasePreset = Preset & { readonly definition: ResolvedPreset };

export const isBuiltInPreset = (id: string): id is BasePresetId =>
  (BASE_PRESET_IDS as readonly string[]).includes(id);

/** Built-ins predate every event: a fixed `createdAt` keeps them first in any ordering. */
const BUILT_IN_CREATED_AT = "1970-01-01T00:00:00.000Z";

const DEFAULT_NOTIFY: NotifyParams = {
  criticalHours: 24,
  criticalProgress: 0.5,
  criticalScore: 10,
  waitingDays: 7,
  inProgressIdleDays: 5,
};

const NO_FIELDS: PresetFields = {
  link: false,
  description: false,
  startAt: false,
  submitVia: false,
};

const basePreset = (id: BasePresetId, name: string, definition: ResolvedPreset): BasePreset => ({
  id,
  name,
  extends: null,
  builtIn: true,
  archived: false,
  definition,
  createdAt: BUILT_IN_CREATED_AT,
  order: BASE_PRESET_IDS.indexOf(id) + 1,
});

export const BASE_PRESETS: Readonly<Record<BasePresetId, BasePreset>> = {
  hw: basePreset("hw", "Homework", {
    urgencyPolicy: "pace",
    defaultImportance: "normal",
    deadlinePolicy: { kind: "hard" },
    submission: "per_subtask",
    progressMode: "subtasks",
    recurrence: null,
    fields: { ...NO_FIELDS, description: true },
    // Homework is short and dense: half a day of warning is what makes a difference.
    notify: { ...DEFAULT_NOTIFY, criticalHours: 12 },
    defaultEstimateMinutes: 60,
    color: "yellow",
  }),
  work: basePreset("work", "Work", {
    urgencyPolicy: "lag",
    defaultImportance: "normal",
    deadlinePolicy: { kind: "hard" },
    submission: "whole",
    progressMode: "slider",
    recurrence: null,
    fields: { ...NO_FIELDS, link: true, description: true, startAt: true },
    notify: DEFAULT_NOTIFY,
    defaultEstimateMinutes: 120,
    color: "violet",
  }),
  personal: basePreset("personal", "Personal", {
    urgencyPolicy: "age",
    defaultImportance: "normal",
    deadlinePolicy: { kind: "hard" },
    submission: "whole",
    progressMode: "subtasks",
    recurrence: null,
    fields: NO_FIELDS,
    notify: DEFAULT_NOTIFY,
    defaultEstimateMinutes: 30,
    color: "orange",
  }),
  deferred: basePreset("deferred", "Deferred", {
    urgencyPolicy: "age",
    defaultImportance: "nice_to_have",
    deadlinePolicy: { kind: "hard" },
    submission: "whole",
    progressMode: "none",
    recurrence: null,
    fields: { ...NO_FIELDS, startAt: true },
    notify: DEFAULT_NOTIFY,
    defaultEstimateMinutes: 15,
    color: "slate",
  }),
  inbox: basePreset("inbox", "Inbox", {
    urgencyPolicy: "age",
    defaultImportance: "nice_to_have",
    deadlinePolicy: { kind: "hard" },
    submission: "whole",
    progressMode: "none",
    recurrence: null,
    fields: NO_FIELDS,
    notify: DEFAULT_NOTIFY,
    defaultEstimateMinutes: 15,
    color: "teal",
  }),
};
