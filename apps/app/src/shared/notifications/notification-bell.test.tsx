import { act, fireEvent, screen } from "@testing-library/react-native";

import type { PoolNotification } from "@pace/core";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";

import { NotificationBell } from "./notification-bell.tsx";

// eslint-disable-next-line sonarjs/no-hardcoded-ip -- the address a sign-in notice shows
const SIGN_IN_IP = "1.2.3.4";

/** The artboard's Tuesday, Moscow: the feed's items are from that morning. */
const login: PoolNotification = {
  createdAt: "2026-10-06T08:00:00.000Z",
  id: "n-login",
  kind: "login",
  payload: {
    country: "Germany",
    ip: SIGN_IN_IP,
    kind: "web",
    name: "Chrome on macOS",
    sessionId: "s",
  },
  readAt: null,
  resolution: null,
  resolvedAt: null,
};

const digest: PoolNotification = {
  createdAt: "2026-10-06T06:00:00.000Z",
  id: "n-digest",
  kind: "deadline_digest",
  payload: {
    slot: "2026-10-06T06:00:00.000Z",
    tasks: [
      {
        dueAt: "2026-10-07T15:00:00.000Z",
        dueTz: null,
        taskId: "t-report",
        title: "Write the report",
      },
    ],
  },
  readAt: null,
  resolution: null,
  resolvedAt: null,
};

const overrun: PoolNotification = {
  createdAt: "2026-10-06T09:00:00.000Z",
  id: "n-overrun",
  kind: "activity_overrun",
  payload: {
    activityId: "a",
    askedAt: "2026-10-06T09:00:00.000Z",
    expectMinutes: 30,
    label: "Commute",
    startAt: "2026-10-06T08:00:00.000Z",
  },
  readAt: null,
  resolution: null,
  resolvedAt: null,
};

/** The digest goes to the app too, so a phone shows both kinds. */
const digestOnApp = {
  deviceId: "dev",
  id: "01ARZ3NDEKTSV4RRFFQ69G5FZZ",
  occurredAt: "2026-10-01T06:00:00.000Z",
  payload: { notificationChannels: { deadline_digest: { app: true } } },
  precision: "exact" as const,
  recordedAt: "2026-10-01T06:00:00.000Z",
  source: "app" as const,
  type: "settings.updated" as const,
};

const feedRuntime = async (
  items: readonly PoolNotification[],
  routes: Parameters<typeof createTestRuntime>[0] extends infer O
    ? O extends { routes?: infer R }
      ? R
      : never
    : never = {},
) => {
  const read = jest.fn(() => ({ ok: true }));
  const runtime = await createTestRuntime({
    routes: {
      "GET /api/notifications": () => ({ deliveries: {}, items, more: false }),
      "POST /api/notifications/read": read,
      ...routes,
    },
    world: "empty",
  });
  await runtime.state.ingest([digestOnApp]);
  return { read, runtime };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("the bell", () => {
  it("counts the unread the phone shows, and its count follows a notification arriving live", async () => {
    const { runtime } = await feedRuntime([
      login,
      { ...digest, readAt: "2026-10-06T07:00:00.000Z" },
    ]);
    await renderScreen(<NotificationBell />, runtime);
    await act(async () => {
      await runtime.notifications.refresh();
    });
    expect(
      screen.getByRole("button", { name: en("notifications.openUnread", { count: 1 }) }),
    ).toBeOnTheScreen();
    await act(async () => {
      runtime.notifications.receive({ notification: overrun, type: "notification" });
      await Promise.resolve();
    });
    await fireEvent.press(
      screen.getByRole("button", { name: en("notifications.openUnread", { count: 2 }) }),
    );
    expect(router.push).toHaveBeenCalledWith("/notifications");
  });
});
