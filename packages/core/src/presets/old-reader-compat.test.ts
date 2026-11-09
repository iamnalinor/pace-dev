import { describe, expect, it } from "vitest";

import { parsePresetDefinition, PresetDefinitionSchema } from "./preset-schema.ts";
import * as previous from "./previous-release/preset-schema.e03360f.frozen.ts";

/**
What an older installed app (the previous release, e03360f) does with the preset definitions this
build writes (bug-lessons 13, 150, 188). The old reducer drops a whole `preset.created` /
`preset.updated` whose definition its strict schema refuses: on a create the preset is missing on
that device, on an update everything in that update (name, recurrence, deadline policy) is lost
there. The owner accepted one such shape (2026-11-09: update every device first); this test keeps
it the only one, and makes every new definition key a decision.
*/

const recurrence = {
  due: { time: "23:59", weekday: 3 },
  issued: { time: "10:00", weekday: 1 },
  tz: "Europe/Moscow",
};

/** One shape per key and variant this build can store, as given by the editor or MCP. */
const WRITTEN: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  empty: {},
  importance: { defaultImportance: "prioritized" },
  hardDeadline: { deadlinePolicy: { kind: "hard" } },
  resubmissionOffset: {
    deadlinePolicy: {
      finalAt: null,
      finalMode: "offset",
      finalTz: null,
      kind: "resubmission",
      softDays: 7,
    },
  },
  resubmissionFixed: {
    deadlinePolicy: {
      finalAt: "2026-12-20T20:59:00.000Z",
      finalMode: "fixed",
      finalTz: "Europe/Moscow",
      kind: "resubmission",
      softDays: 3,
    },
  },
  progress: { progressMode: "slider" },
  recurrence: { recurrence },
  recurrenceRemoved: { recurrence: null },
  // Weekday names are stored as their numbers (`parsePresetDefinition`), so old apps read them.
  recurrenceByName: {
    recurrence: {
      ...recurrence,
      due: { time: "23:59", weekday: "Wednesday" },
      issued: { time: "10:00", weekday: "mon" },
    },
  },
  recurrenceFirstNumber: { recurrence: { ...recurrence, firstNumber: 9 } },
  fields: { fields: { description: true, link: true, startAt: false, submitVia: true } },
  estimate: { defaultEstimateMinutes: 90 },
  color: { color: "blue" },
  // Read and dropped by this build, so never written again.
  legacySubmission: { submission: "per_subtask" },
};

/** The shapes an older app refuses, and so drops the event that carries them. */
const REFUSED_BY_OLD_APPS = ["recurrenceFirstNumber"];

/** What this build stores for a definition (MCP's `storedDefinition`, the editor's save). */
const stored = (definition: Readonly<Record<string, unknown>>): unknown => {
  const parsed = parsePresetDefinition(definition);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

describe("preset definitions this build writes, read by the previous release", () => {
  it("are read by older apps, except a recurrence with firstNumber, which they drop", () => {
    const refused = Object.entries(WRITTEN)
      .filter(([, definition]) => !previous.parsePresetDefinition(stored(definition)).ok)
      .map(([name]) => name);
    expect(refused).toEqual(REFUSED_BY_OLD_APPS);
  });

  it("refuses firstNumber by name, the whole definition with it", () => {
    const old = previous.PresetDefinitionSchema.safeParse(
      stored(WRITTEN["recurrenceFirstNumber"] ?? {}),
    );
    expect(old.success).toBe(false);
    expect(old.error?.issues).toEqual([
      expect.objectContaining({ code: "unrecognized_keys", keys: ["firstNumber"] }),
    ]);
  });

  it("covers every key this build's schema stores (a new key must be classified here)", () => {
    const covered = new Set(
      Object.values(WRITTEN).flatMap((definition) => Object.keys(definition)),
    );
    expect([...covered].toSorted((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(PresetDefinitionSchema.shape)
        // Legacy keys no editor or tool writes any more (urgency scoring, stage 6; notify, stage 8).
        .filter((key) => key !== "urgencyPolicy" && key !== "notify")
        .toSorted((a, b) => a.localeCompare(b)),
    );
    // The recurrence's keys: the old ones (issued, due, tz) and firstNumber, refused above.
    const written = stored(WRITTEN["recurrenceFirstNumber"] ?? {}) as {
      readonly recurrence: object;
    };
    expect(Object.keys(written.recurrence).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "due",
      "firstNumber",
      "issued",
      "tz",
    ]);
  });

  it("keeps preset ids readable by older apps (the same slug rule)", () => {
    expect(previous.PresetIdSchema.safeParse("hw.algebra-2").success).toBe(true);
  });
});
