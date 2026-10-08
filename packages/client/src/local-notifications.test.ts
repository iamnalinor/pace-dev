import { describe, expect, it } from "vitest";

import { createApiClient } from "./api-client.ts";
import { createFakeFetch, problem } from "./fake-fetch.fake.ts";
import {
  fetchNotificationPlan,
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
});
