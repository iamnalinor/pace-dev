import type { EventInput } from "../events/event-schema.ts";
import type { PresetDefinition } from "../model/preset.ts";

import { type Language, t } from "../i18n/i18n.ts";
import { presetById, type PresetsState } from "./preset-reducer.ts";
import { isPresetNameFree } from "./resolve-preset.ts";

export const EXAMPLE_PRESET_IDS = ["hw.algebra", "hw.calculus", "hw.history"] as const;

export type ExamplePresetId = (typeof EXAMPLE_PRESET_IDS)[number];

const MOSCOW = "Europe/Moscow";

const EXAMPLES: Readonly<Record<ExamplePresetId, { readonly definition: PresetDefinition }>> = {
  "hw.algebra": {
    definition: {
      deadlinePolicy: { kind: "resubmission", softDays: 7, finalAt: null, finalTz: null },
      recurrence: {
        issued: { weekday: 1, time: "10:00" },
        due: { weekday: 3, time: "23:59" },
        tz: MOSCOW,
      },
    },
  },
  "hw.calculus": {
    definition: {
      recurrence: {
        issued: { weekday: 2, time: "12:00" },
        due: { weekday: 1, time: "23:59" },
        tz: MOSCOW,
      },
    },
  },
  "hw.history": {
    definition: {
      defaultImportance: "nice_to_have",
      recurrence: {
        issued: { weekday: 4, time: "09:00" },
        due: { weekday: 4, time: "09:00" },
        tz: MOSCOW,
      },
    },
  },
};

/** Each example's name key: a seed is written in the account's language (QA round 23 R23-06). */
const NAME_KEYS = {
  "hw.algebra": "preset.example.algebra",
  "hw.calculus": "preset.example.calculus",
  "hw.history": "preset.example.history",
} as const satisfies Record<ExamplePresetId, string>;

/**
The one-click seed offered on first login, named in `language` (the account's). The ids are
fixed, so applying the seed again creates nothing: the reducer ignores a `preset.created` for an
existing id.
*/
export const exampleCoursePresetEvents = (
  now: string,
  language: Language = "en",
): readonly EventInput[] =>
  EXAMPLE_PRESET_IDS.map((id) => ({
    type: "preset.created",
    occurredAt: now,
    precision: "exact",
    source: "web",
    payload: {
      id,
      name: t(language, NAME_KEYS[id]),
      extends: "hw",
      definition: EXAMPLES[id].definition,
    },
  }));

/**
Whether the seed should create this example: its id is not there yet, and no preset in use goes by
its name (a person's own "Algebra HW" would otherwise read as two identical chips, review M6).
*/
export const isExampleToSeed = (state: PresetsState, event: EventInput): boolean =>
  event.type === "preset.created" &&
  presetById(state, event.payload.id) === undefined &&
  isPresetNameFree(state, event.payload.id, event.payload.name);
