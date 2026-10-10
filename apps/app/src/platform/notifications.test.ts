import * as Notifications from "expo-notifications";

import { createApiClient, createAppState, createMemoryEventStore } from "@pace/client";
import { createFakeFetch } from "@pace/client/testing";

import { syncActivityTimers, syncLocalNotifications } from "./notifications.ts";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => [
    { identifier: "pace:digest:2026-10-06T11:00:00.000Z" },
    { identifier: "someone-else" },
  ]),
  getPermissionsAsync: jest.fn(async () => ({ canAskAgain: true, granted: true })),
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

  it("replaces stale reminders and schedules the plan", async () => {
    await syncLocalNotifications(await client({ "GET /api/notify/plan": () => plan }));
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
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

  it("never asks: without the permission nothing is scheduled", async () => {
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValueOnce({ canAskAgain: true, granted: false } as never);
    await syncLocalNotifications(await client({ "GET /api/notify/plan": () => plan }));
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("leaves the scheduled reminders alone when offline", async () => {
    await syncLocalNotifications(await client({}));
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe("syncActivityTimers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("asks at twice the running activity's Expect and leaves the plan's reminders alone", async () => {
    const { state } = await client({});
    const clock = { deviceTz: "Europe/Moscow", now: () => "2026-10-06T12:00:00.000Z" };
    const started = await state.dispatch({
      occurredAt: "2026-10-06T12:00:00.000Z",
      payload: { activityId: "a1", category: "commute", expectMinutes: 45, label: "Commute" },
      precision: "exact",
      source: "app",
      type: "activity.started",
    });
    expect(started.ok).toBe(true);
    await syncActivityTimers({ clock, state });
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { body: "Still doing Commute?", title: "Pace" },
      identifier: "pace:activity:a1:long",
      trigger: { channelId: "timers", date: new Date("2026-10-06T13:30:00.000Z"), type: "date" },
    });
  });
});
