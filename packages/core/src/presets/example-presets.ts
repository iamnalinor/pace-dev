import type { EventInput } from "../events/event-schema.ts";
import type { PresetDefinition } from "../model/preset.ts";

export const EXAMPLE_PRESET_IDS = ["hw.algebra", "hw.calculus", "hw.history"] as const;

export type ExamplePresetId = (typeof EXAMPLE_PRESET_IDS)[number];

const MOSCOW = "Europe/Moscow";

const EXAMPLES: Readonly<
  Record<ExamplePresetId, { readonly name: string; readonly definition: PresetDefinition }>
> = {
  "hw.algebra": {
    name: "Algebra HW",
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
    name: "Calculus HW",
    definition: {
      recurrence: {
        issued: { weekday: 2, time: "12:00" },
        due: { weekday: 1, time: "23:59" },
        tz: MOSCOW,
      },
    },
  },
  "hw.history": {
    name: "History HW",
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

/**
The one-click seed offered on first login. The ids are fixed, so applying the seed
again creates nothing: the reducer ignores a `preset.created` for an existing id.
*/
export const exampleCoursePresetEvents = (now: string): readonly EventInput[] =>
  EXAMPLE_PRESET_IDS.map((id) => ({
    type: "preset.created",
    occurredAt: now,
    precision: "exact",
    source: "web",
    payload: { id, name: EXAMPLES[id].name, extends: "hw", definition: EXAMPLES[id].definition },
  }));
