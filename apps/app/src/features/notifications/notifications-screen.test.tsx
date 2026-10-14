import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { PoolNotification } from "@pace/core";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";

import { NotificationsScreen } from "./notifications-screen.tsx";

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

describe("NotificationsScreen", () => {
  it("shows a sign-in and a digest whose tasks open, and marks what it shows read", async () => {
    const { read, runtime } = await feedRuntime([login, digest]);
    await renderScreen(<NotificationsScreen />, runtime);
    expect(
      await screen.findByText(en("notifications.login", { name: "Chrome on macOS" })),
    ).toBeOnTheScreen();
    expect(screen.getByText(`${SIGN_IN_IP} · Germany`)).toBeOnTheScreen();
    expect(screen.getByText(en("notifications.digestTitle"))).toBeOnTheScreen();
    await waitFor(() => {
      expect(read).toHaveBeenCalledTimes(1);
    });
    await fireEvent.press(screen.getByRole("link", { name: /Write the report/u }));
    expect(router.push).toHaveBeenCalledWith("/task/t-report");
    await fireEvent.press(screen.getByRole("link", { name: en("notifications.assistantLog") }));
    expect(router.push).toHaveBeenCalledWith("/decisions");
  });

  it("answers Yes, still from the feed: pending until the server has it, then its resolution", async () => {
    const answered = {
      ...overrun,
      readAt: "x",
      resolution: "still" as const,
      resolvedAt: "2026-10-06T09:05:00.000Z",
    };
    const { promise: held, resolve: release } = Promise.withResolvers<undefined>();
    const { runtime } = await feedRuntime([overrun], {
      "POST /api/notifications/n-overrun/resolve": async () => {
        await held;
        return { notification: { ...answered, readAt: "2026-10-06T09:05:00.000Z" } };
      },
    });
    await renderScreen(<NotificationsScreen />, runtime);
    await fireEvent.press(await screen.findByRole("button", { name: en("notify.action.still") }));
    // Pending: both answers wait, nothing says it is done yet.
    expect(screen.getByRole("button", { name: en("notify.action.stopped") })).toBeDisabled();
    expect(screen.queryByText(en("notify.resolved.still"))).toBeNull();
    await act(async () => {
      release(undefined);
      await held;
    });
    expect(await screen.findByText(en("notify.resolved.still"))).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: en("notify.action.stopped") })).toBeNull();
  });

  it("says a refused answer did not go through and keeps the buttons", async () => {
    const { runtime } = await feedRuntime([overrun], {
      "POST /api/notifications/n-overrun/resolve": () =>
        Response.json({ code: "retro/future", message: "no" }, { status: 409 }),
    });
    await renderScreen(<NotificationsScreen />, runtime);
    await fireEvent.press(await screen.findByRole("button", { name: en("notify.action.stopped") }));
    expect(await screen.findByText(en("notifications.failedAction"))).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: en("notify.action.still") })).toBeEnabled();
  });

  it("says when there is nothing yet", async () => {
    const { runtime } = await feedRuntime([]);
    await renderScreen(<NotificationsScreen />, runtime);
    expect(await screen.findByText(en("notifications.empty"))).toBeOnTheScreen();
  });
});
