import { describe, expect, it } from "vitest";

import { AUTO_SLEEP_LABEL, type PoolNotification, sleepStartId } from "@pace/core";

import { phoneContent, telegramMessage } from "./notify-text.ts";

/** "Still sleeping?" about a sleep automatic sleep opened (its stored label is the server's). */
const overrun = (activityId: string): PoolNotification => ({
  createdAt: "2026-10-08T08:40:00.000Z",
  id: "n-sleep",
  kind: "activity_overrun",
  payload: {
    activityId,
    askedAt: "2026-10-08T08:40:00.000Z",
    expectMinutes: 480,
    label: AUTO_SLEEP_LABEL,
    startAt: "2026-10-07T20:40:00.000Z",
  },
  readAt: null,
  resolution: null,
  resolvedAt: null,
});

const RU = { language: "ru", timezone: "Europe/Moscow" } as const;
const NOW = "2026-10-08T08:41:00.000Z";

describe("a notification's text", () => {
  it("words automatic sleep's label in the person's language (class 42)", () => {
    const auto = overrun(sleepStartId("2026-10-07", "2026-10-07T20:40:00.000Z"));
    expect(phoneContent(auto, RU, NOW).body).toContain("Сон");
    expect(phoneContent(auto, RU, NOW).body).not.toContain(AUTO_SLEEP_LABEL);
    expect(telegramMessage(auto, RU, { now: NOW, webOrigin: "" }).text).toContain("Сон");
    // What a person typed stays as they typed it.
    expect(phoneContent(overrun("a-typed"), RU, NOW).body).toContain(AUTO_SLEEP_LABEL);
  });
});
