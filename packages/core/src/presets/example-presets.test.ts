import { describe, expect, it } from "vitest";

import { parseEvent } from "../events/event-schema.ts";
import { materialize } from "../materialize/materializer.ts";
import { EXAMPLE_PRESET_IDS, exampleCoursePresetEvents } from "./example-presets.ts";
import { INITIAL_PRESETS_STATE, presetReducer } from "./preset-reducer.ts";
import { parsePresetDefinition } from "./preset-schema.ts";
import { resolvePreset } from "./resolve-preset.ts";

const NOW = "2026-10-06T10:00:00.000Z";

const seeded = () =>
  materialize(
    exampleCoursePresetEvents(NOW).map((input, index) => {
      const parsed = parseEvent({
        ...input,
        deviceId: "d",
        id: `01ARZ3NDEKTSV4RRFFQ69G5F${String(index).padStart(2, "0")}`,
        recordedAt: NOW,
      });
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      return parsed.value;
    }),
    presetReducer,
    INITIAL_PRESETS_STATE,
  );

describe("exampleCoursePresetEvents", () => {
  it("emits one valid preset.created per example id, at `now`, extending hw", () => {
    const events = exampleCoursePresetEvents(NOW);
    expect(events.map((input) => input.type)).toEqual([
      "preset.created",
      "preset.created",
      "preset.created",
    ]);
    expect(events.every((input) => input.occurredAt === NOW)).toBe(true);
    const payloads = events.map((input) =>
      input.type === "preset.created" ? input.payload : undefined,
    );
    expect(payloads.map((payload) => payload?.id)).toEqual([...EXAMPLE_PRESET_IDS]);
    expect(payloads.every((payload) => payload?.extends === "hw")).toBe(true);
    expect(payloads.every((payload) => parsePresetDefinition(payload?.definition).ok)).toBe(true);
  });

  it("algebra: Mon 10:00 → Wed 23:59 Moscow, resubmission a week after the deadline", () => {
    const algebra = resolvePreset(seeded(), "hw.algebra");
    expect(algebra).toMatchObject({
      ok: true,
      value: {
        deadlinePolicy: { finalAt: null, finalTz: null, kind: "resubmission", softDays: 7 },
        defaultImportance: "normal",
        recurrence: {
          due: { time: "23:59", weekday: 3 },
          issued: { time: "10:00", weekday: 1 },
          tz: "Europe/Moscow",
        },
        submission: "per_subtask",
        urgencyPolicy: "resubmission",
      },
    });
  });

  it("calculus: Tue 12:00 → next Mon 23:59, hard deadline inherited from hw", () => {
    expect(resolvePreset(seeded(), "hw.calculus")).toMatchObject({
      ok: true,
      value: {
        deadlinePolicy: { kind: "hard" },
        defaultImportance: "normal",
        recurrence: {
          due: { time: "23:59", weekday: 1 },
          issued: { time: "12:00", weekday: 2 },
          tz: "Europe/Moscow",
        },
        urgencyPolicy: "pace",
      },
    });
  });

  it("history: Thu 09:00 → Thu 09:00 a week later, nice-to-have", () => {
    expect(resolvePreset(seeded(), "hw.history")).toMatchObject({
      ok: true,
      value: {
        deadlinePolicy: { kind: "hard" },
        defaultImportance: "nice_to_have",
        recurrence: {
          due: { time: "09:00", weekday: 4 },
          issued: { time: "09:00", weekday: 4 },
          tz: "Europe/Moscow",
        },
      },
    });
  });
});
