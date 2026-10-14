import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";

import { DEFAULT_NOTIFICATION_CHANNELS } from "../model/notification-channels.ts";
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
  it("is English, zone-less, with the spec's digest windows and quiet hours, nights hidden", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      digestWindows: ["09:00", "14:00", "21:00"],
      language: "en",
      nightHours: false,
      notificationChannels: DEFAULT_NOTIFICATION_CHANNELS,
      quietHours: { from: "23:00", to: "08:00" },
      timezone: null,
    });
  });

  it("sends a sign-in everywhere, the digest and an event in Telegram, an overrun to the phone", () => {
    expect(DEFAULT_NOTIFICATION_CHANNELS).toEqual({
      activity_overrun: { app: true, telegram: false, web: false },
      deadline_digest: { app: false, telegram: true, web: false },
      event_start: { app: false, telegram: true, web: false },
      login: { app: true, telegram: true, web: true },
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
      nightHours: false,
      notificationChannels: DEFAULT_NOTIFICATION_CHANNELS,
      quietHours: { from: "23:00", to: "08:00" },
      timezone: "Europe/Moscow",
    });
  });

  it("switches only the channels a change names, keeping the others of that kind", () => {
    const events = [
      updated(A, 1, { notificationChannels: { deadline_digest: { web: true } } }),
      updated(B, 2, {
        notificationChannels: { deadline_digest: { telegram: false }, login: { app: false } },
      }),
    ];
    const { notificationChannels } = materialize(events, settingsReducer, DEFAULT_SETTINGS);
    expect(notificationChannels.deadline_digest).toEqual({
      app: false,
      telegram: false,
      web: true,
    });
    expect(notificationChannels.login).toEqual({ app: false, telegram: true, web: true });
    expect(notificationChannels.event_start).toEqual(DEFAULT_NOTIFICATION_CHANNELS.event_start);
  });

  it("replaces quiet hours as a whole", () => {
    const events = [updated(A, 1, { quietHours: { from: "22:00", to: "07:00" } })];
    expect(materialize(events, settingsReducer, DEFAULT_SETTINGS).quietHours).toEqual({
      from: "22:00",
      to: "07:00",
    });
  });

  it("turns the calendar's night hours on and back off", () => {
    const on = [updated(A, 1, { nightHours: true })];
    expect(materialize(on, settingsReducer, DEFAULT_SETTINGS).nightHours).toBe(true);
    const off = [...on, updated(B, 2, { nightHours: false })];
    expect(materialize(off, settingsReducer, DEFAULT_SETTINGS).nightHours).toBe(false);
    // A patch about something else keeps the choice.
    const other = [...on, updated(B, 2, { language: "ru" })];
    expect(materialize(other, settingsReducer, DEFAULT_SETTINGS).nightHours).toBe(true);
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
