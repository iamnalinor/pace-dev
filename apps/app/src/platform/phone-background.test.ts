import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

import type { FakeCalendar } from "#app/testing/calendar.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { checkPhone, PHONE_TASK, startPhoneChecks } from "./phone-background.ts";

const utc = (iso: string): number => Date.parse(`2026-10-${iso}:00.000Z`);

/** Moscow (UTC+3): screen off 23:50, back on 07:40. */
const mockEvents = [
  { className: null, eventType: 15, packageName: "android", timestamp: utc("05T19:00") },
  { className: null, eventType: 16, packageName: "android", timestamp: utc("05T20:50") },
  { className: null, eventType: 15, packageName: "android", timestamp: utc("06T04:40") },
];

jest.mock("../../modules/pace-native/index.ts", () => ({
  paceNative: {
    hasUsageAccess: () => true,
    queryUsageEvents: async () => mockEvents,
  },
}));

type FakeNotifications = {
  state: { granted: boolean; scheduled: { identifier: string; content: { body?: string } }[] };
};

const notifications = Notifications as unknown as FakeNotifications;
const calendar = Calendar as unknown as FakeCalendar;
const NOW = "2026-10-06T06:00:00.000Z";

beforeEach(async () => {
  (SecureStore as unknown as FakeSecureStore).values.clear();
  notifications.state.granted = true;
  notifications.state.scheduled = [];
  calendar.state.status = "granted";
  calendar.state.events = [
    {
      allDay: false,
      endDate: "2026-10-06T05:30:00.000Z",
      id: "ev-1",
      startDate: "2026-10-06T05:00:00.000Z",
      title: "Gym",
    },
  ];
  await startPhoneChecks({ language: "en", zone: "Europe/Moscow" });
});

describe("the background phone check", () => {
  it("asks about last night's sleep and a calendar event that just ended, once each", async () => {
    expect(await checkPhone(NOW)).toBe(2);
    expect(notifications.state.scheduled.map((item) => item.content.body)).toEqual([
      "Slept 23:50–07:40 · 7h 50m. Log it?",
      "Gym, 08:00–08:30",
    ]);
    expect(await checkPhone(NOW)).toBe(0);
  });

  it("stays quiet without the notification permission, and runs as the registered task", async () => {
    notifications.state.granted = false;
    expect(await checkPhone(NOW)).toBe(0);
    const fake = TaskManager as unknown as { tasks: Map<string, () => Promise<unknown>> };
    expect(fake.tasks.has(PHONE_TASK)).toBe(true);
  });
});
