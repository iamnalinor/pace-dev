import * as Notifications from "expo-notifications";

import { createApiClient, createAppState, createMemoryEventStore } from "@pace/client";
import { createFakeFetch } from "@pace/client/testing";

import { syncLocalNotifications } from "./notifications.ts";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => [
    { identifier: "pace:digest:2026-10-06T11:00:00.000Z" },
    { identifier: "someone-else" },
  ]),
  getPermissionsAsync: jest.fn(async () => ({ canAskAgain: true, granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ canAskAgain: true, granted: true })),
  scheduleNotificationAsync: jest.fn(async () => "id"),
  setNotificationChannelAsync: jest.fn(async () => null),
}));

const plan = { items: [{ at: "2026-10-06T18:00:00.000Z", kind: "digest" }] };

const client = async (routes: Parameters<typeof createFakeFetch>[0]) => {
  const fake = createFakeFetch(routes);
  const state = createAppState({
    deviceId: "d",
    now: () => "2026-10-06T12:00:00.000Z",
    source: "app",
    store: createMemoryEventStore(),
  });
  await state.ready;
  return {
    api: createApiClient({ baseUrl: "https://api.test", fetch: fake.fetch, token: () => "t" }),
    state,
  };
};

describe("syncLocalNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("asks for permission, replaces stale reminders and schedules the plan", async () => {
    await syncLocalNotifications(await client({ "GET /api/notify/plan": () => plan }));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "pace:digest:2026-10-06T11:00:00.000Z",
    );
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { body: "Time for a look at Now.", title: "Pace" },
      identifier: "pace:digest:2026-10-06T18:00:00.000Z",
      trigger: { channelId: "reminders", date: new Date("2026-10-06T18:00:00.000Z"), type: "date" },
    });
  });

  it("leaves the scheduled reminders alone when offline", async () => {
    await syncLocalNotifications(await client({}));
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
