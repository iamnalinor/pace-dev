import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";

import { DEFAULT_SETTINGS } from "../model/settings.ts";
import { materialize } from "./materializer.ts";
import { settingsReducer } from "./settings-reducer.ts";

const at = (hour: number): string => `2026-10-06T${String(hour).padStart(2, "0")}:00:00.000Z`;

const updated = (id: string, hour: number, payload: Event["payload"]): Event =>
  ({
    deviceId: "d",
    id,
    occurredAt: at(hour),
    payload,
    precision: "exact",
    recordedAt: at(hour),
    source: "app",
    type: "settings.updated",
  }) as Event;

const A = "01ARZ3NDEKTSV4RRFFQ69G5FAA";
const B = "01ARZ3NDEKTSV4RRFFQ69G5FAB";

describe("DEFAULT_SETTINGS", () => {
  it("is English, zone-less, with the spec's digest windows and quiet hours", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      digestWindows: ["09:00", "14:00", "21:00"],
      language: "en",
      quietHours: { from: "23:00", to: "08:00" },
      timezone: null,
    });
  });
});

describe("settingsReducer", () => {
  it("starts from the defaults", () => {
    expect(materialize([], settingsReducer, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("merges only the fields present in settings.updated", () => {
    const events = [
      updated(A, 1, { language: "ru", timezone: "Europe/Moscow" }),
      updated(B, 2, { digestWindows: ["10:00"] }),
    ];
    expect(materialize(events, settingsReducer, DEFAULT_SETTINGS)).toEqual({
      digestWindows: ["10:00"],
      language: "ru",
      quietHours: { from: "23:00", to: "08:00" },
      timezone: "Europe/Moscow",
    });
  });

  it("replaces quiet hours as a whole", () => {
    const events = [updated(A, 1, { quietHours: { from: "22:00", to: "07:00" } })];
    expect(materialize(events, settingsReducer, DEFAULT_SETTINGS).quietHours).toEqual({
      from: "22:00",
      to: "07:00",
    });
  });

  it("ignores other events", () => {
    const other: Event = {
      deviceId: "d",
      id: A,
      occurredAt: at(1),
      payload: { taskId: "t" },
      precision: "exact",
      recordedAt: at(1),
      source: "app",
      type: "task.reopened",
    };
    expect(settingsReducer(DEFAULT_SETTINGS, other)).toBe(DEFAULT_SETTINGS);
  });
});
