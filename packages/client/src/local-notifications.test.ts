import { describe, expect, it } from "vitest";

import { createApiClient } from "./api-client.ts";
import { createFakeFetch, problem } from "./fake-fetch.fake.ts";
import {
  activityNotifications,
  calendarNotifications,
  fetchNotificationPlan,
  isActivityId,
  isCalendarId,
  isPlanId,
  localNotifications,
  scheduleChanges,
} from "./local-notifications.ts";

const plan = [
  { at: "2026-10-06T18:00:00.000Z", kind: "digest" as const },
  {
    at: "2026-10-07T09:00:00.000Z",
    kind: "deadline" as const,
    taskId: "t-report",
    title: "Write the report",
  },
];

describe("local notifications", () => {
  it("turns the plan into reminders in the account language", () => {
    expect(localNotifications(plan, "ru")).toEqual([
      {
        at: "2026-10-06T18:00:00.000Z",
        body: "Пора заглянуть в «Сейчас».",
        id: "pace:digest:2026-10-06T18:00:00.000Z",
        title: "Pace",
      },
      {
        at: "2026-10-07T09:00:00.000Z",
        body: "Write the report: срок приближается.",
        id: "pace:deadline:t-report:2026-10-07T09:00:00.000Z",
        title: "Pace",
      },
    ]);
  });

  it("cancels only its own stale reminders and adds only the missing ones", () => {
    const wanted = localNotifications(plan, "en");
    const changes = scheduleChanges(
      ["pace:digest:2026-10-06T18:00:00.000Z", "pace:digest:2026-10-06T11:00:00.000Z", "other-app"],
      wanted,
    );
    expect(changes.cancel).toEqual(["pace:digest:2026-10-06T11:00:00.000Z"]);
    expect(changes.schedule.map((item) => item.id)).toEqual([
      "pace:deadline:t-report:2026-10-07T09:00:00.000Z",
    ]);
  });

  it("fetches the plan, and gives null when offline or refused", async () => {
    const ok = createFakeFetch({ "GET /api/notify/plan": () => ({ items: plan }) });
    const api = createApiClient({ baseUrl: "https://api.test", fetch: ok.fetch, token: () => "t" });
    expect(await fetchNotificationPlan(api)).toEqual(plan);
    const down = createFakeFetch({ "GET /api/notify/plan": () => problem(401, "auth/required") });
    const refused = createApiClient({
      baseUrl: "https://api.test",
      fetch: down.fetch,
      token: () => "t",
    });
    expect(await fetchNotificationPlan(refused)).toBeNull();
  });

  it("never lets the plan sync cancel the activity timers", () => {
    const changes = scheduleChanges(
      ["pace:activity:a1:long", "pace:digest:2026-10-06T11:00:00.000Z"],
      [],
    );
    expect(changes.cancel).toEqual(["pace:digest:2026-10-06T11:00:00.000Z"]);
  });

  it("asks whether the running activity is still going at twice its Expect, once that is ahead", () => {
    const running = {
      activityId: "a1",
      expectMinutes: 30,
      label: "Commute",
      startAt: "2026-10-06T12:00:00.000Z",
    };
    expect(activityNotifications(running, "2026-10-06T12:10:00.000Z", "en")).toEqual([
      {
        at: "2026-10-06T13:00:00.000Z",
        body: "Still doing Commute?",
        id: "pace:activity:a1:long",
        title: "Pace",
      },
    ]);
    expect(activityNotifications(running, "2026-10-06T13:10:00.000Z", "en")).toEqual([]);
    expect(
      activityNotifications({ ...running, expectMinutes: null }, "2026-10-06T12:10:00.000Z", "en"),
    ).toEqual([]);
    expect(activityNotifications(null, "2026-10-06T12:10:00.000Z", "en")).toEqual([]);
    expect(isActivityId("pace:activity:a1:long")).toBe(true);
    expect(isActivityId("pace:digest:x")).toBe(false);
  });

  it("asks about each calendar event as it starts, and keeps those reminders from the plan sync", () => {
    const events = [
      {
        endAt: "2026-10-06T08:00:00.000Z",
        id: "past",
        startAt: "2026-10-06T07:00:00.000Z",
        title: "Gone",
      },
      {
        endAt: "2026-10-06T11:30:00.000Z",
        id: "e1",
        startAt: "2026-10-06T10:00:00.000Z",
        title: "Seminar",
      },
    ];
    expect(
      calendarNotifications(events, {
        clock: (at) => at.slice(11, 16),
        language: "en",
        now: "2026-10-06T09:00:00.000Z",
      }),
    ).toEqual([
      {
        at: "2026-10-06T10:00:00.000Z",
        body: "Seminar, 10:00–11:30. Attend?",
        id: "pace:calendar:e1@2026-10-06T10:00:00.000Z",
        title: "Starting now",
      },
    ]);
    expect(isPlanId("pace:calendar:e1@x")).toBe(false);
    expect(isCalendarId("pace:calendar:e1@x")).toBe(true);
  });
});
