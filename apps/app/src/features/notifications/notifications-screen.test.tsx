import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import { isControl } from "#app/test/focus-target.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { formatRelativeDay, type PoolNotification } from "@pace/core";
import { MOSCOW, NOW } from "@pace/core/testing";

import { NotificationsScreen } from "./notifications-screen.tsx";

/** Where focus went, as the feed asked the platform (bug class 5). */
const mockMoveFocus = jest.fn<undefined, [unknown, string | undefined]>();
jest.mock("#app/platform/move-focus.ts", (): unknown => ({
  isFocusLost: () => true,
  moveFocus: (target: unknown, say?: string) => {
    mockMoveFocus(target, say);
  },
}));

/** What a focus target says: the text of the line it wraps (the status is a View around a Text). */
const textOf = (target: unknown): unknown => {
  const line = (target as null | { readonly props?: { readonly children?: unknown } })?.props
    ?.children;
  return (line as null | { readonly props?: { readonly children?: unknown } })?.props?.children;
};

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

/** Not me, then its confirm's End session: it ends a session for good, so it asks first. */
const endFromFeed = async (): Promise<void> => {
  await fireEvent.press(await screen.findByRole("button", { name: en("notify.action.revoked") }));
  await fireEvent.press(screen.getByRole("button", { name: en("notifications.notMeEnd") }));
};

/** The account's sessions as `GET /api/sessions` lists them: this browser and maybe others. */
const sessionsList = (ids: readonly string[]) => () => ({
  sessions: ids.map((id) => ({
    city: null,
    country: "DE",
    createdAt: 1,
    current: id === "me",
    id,
    ip: SIGN_IN_IP,
    kind: "browser",
    lastDataAt: null,
    lastSeenAt: 1,
    name: "Chrome on macOS",
  })),
});

describe("NotificationsScreen", () => {
  it("puts an item under the day its time is on: one zone, the device's, for both", async () => {
    // 01:30 in Moscow (the device) is today; in New York (the account) it is still yesterday.
    const lateLogin = { ...login, createdAt: "2026-10-05T22:30:00.000Z", id: "n-late" };
    const { runtime } = await feedRuntime([lateLogin]);
    await runtime.state.ingest([
      {
        ...digestOnApp,
        id: "01ARZ3NDEKTSV4RRFFQ69G5FZY",
        payload: { timezone: "America/New_York" },
      },
    ]);
    await renderScreen(<NotificationsScreen />, runtime);
    expect(await screen.findByText("01:30")).toBeOnTheScreen();
    const today = formatRelativeDay(lateLogin.createdAt, NOW, { language: "en", tz: MOSCOW });
    expect(screen.getByRole("header", { name: today })).toBeOnTheScreen();
  });

  it("shows where each notification went, when, and when it was taken back", async () => {
    const { runtime } = await feedRuntime([login], {
      "GET /api/notifications": () => ({
        deliveries: {
          "n-login": [
            {
              at: "2026-10-06T08:00:00.000Z",
              device: "Telegram",
              dismissedAt: null,
              method: "telegram",
              reason: null,
              result: "sent",
            },
            {
              at: "2026-10-06T08:00:00.000Z",
              device: "Pixel",
              dismissedAt: "2026-10-06T08:05:00.000Z",
              method: "fcm",
              reason: null,
              result: "sent",
            },
          ],
        },
        items: [login],
        more: false,
      }),
    });
    await renderScreen(<NotificationsScreen />, runtime);
    expect(
      await screen.findByText(en("notifications.delivery.telegram.sent", { time: "11:00" })),
    ).toBeOnTheScreen();
    const google = en("notifications.method.fcm");
    expect(
      screen.getByText(
        en("notifications.delivery.sent", { device: "Pixel", method: google, time: "11:00" }),
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(en("notifications.delivery.dismissed", { device: "Pixel", time: "11:05" })),
    ).toBeOnTheScreen();
  });

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

  it("asks to mark each notice read once, though the server leaves one unread and every read refreshes the feed (QA round 15 H1)", async () => {
    const holder: { runtime?: Awaited<ReturnType<typeof createTestRuntime>> } = {};
    // The server leaves both unread (as it does a session's own sign-in notice); each read's live
    // "read" notice reloads the feed, as the socket does.
    const read = jest.fn(() => {
      setTimeout(() => {
        holder.runtime?.notifications.receive({ type: "read" });
      }, 0);
      return { ok: true };
    });
    const { runtime } = await feedRuntime([login, digest], {
      "POST /api/notifications/read": read,
    });
    holder.runtime = runtime;
    await renderScreen(<NotificationsScreen />, runtime);
    await screen.findByText(en("notifications.digestTitle"));
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
    });
    const asked = (read.mock.calls as unknown as [{ body: { ids: string[] } }][]).flatMap(
      ([request]) => request.body.ids,
    );
    expect(asked.toSorted((a, b) => a.localeCompare(b))).toEqual(["n-digest", "n-login"]);
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

  it("ends a sign-in's session from the feed with Not me, then says it ended", async () => {
    const resolve = jest.fn(() => ({
      notification: {
        ...login,
        readAt: "2026-10-06T09:05:00.000Z",
        resolution: "revoked",
        resolvedAt: "2026-10-06T09:05:00.000Z",
      },
    }));
    const { runtime } = await feedRuntime([login], {
      "POST /api/notifications/n-login/resolve": resolve,
    });
    await renderScreen(<NotificationsScreen />, runtime);
    await endFromFeed();
    expect(await screen.findByText(en("notify.resolved.revoked"))).toBeOnTheScreen();
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ resolution: "revoked" }) as unknown,
      }),
    );
  });

  it("moves focus to the status that replaces the answered button (QA round 16 M1, bug class 5)", async () => {
    const { runtime } = await feedRuntime([login], {
      "POST /api/notifications/n-login/resolve": () => ({
        notification: {
          ...login,
          readAt: "2026-10-06T09:05:00.000Z",
          resolution: "revoked",
          resolvedAt: "2026-10-06T09:05:00.000Z",
        },
      }),
    });
    await renderScreen(<NotificationsScreen />, runtime);
    await endFromFeed();
    await screen.findByText(en("notify.resolved.revoked"));
    expect(textOf(mockMoveFocus.mock.calls.at(-1)?.[0])).toBe(en("notify.resolved.revoked"));
  });

  it("does not move focus when the answer is refused: the button keeps it", async () => {
    const { runtime } = await feedRuntime([login], {
      "POST /api/notifications/n-login/resolve": () => {
        throw new Error("offline");
      },
    });
    await renderScreen(<NotificationsScreen />, runtime);
    await endFromFeed();
    const moves = mockMoveFocus.mock.calls.length;
    expect(await screen.findByText(en("notifications.failedAction"))).toBeOnTheScreen();
    expect(mockMoveFocus).toHaveBeenCalledTimes(moves);
  });

  it("offers no Not me on this session's own sign-in, which only the person's other devices answer", async () => {
    const thisSession = {
      city: null,
      country: "DE",
      createdAt: 1,
      current: true,
      id: "s",
      ip: SIGN_IN_IP,
      kind: "browser",
      lastDataAt: null,
      lastSeenAt: 1,
      name: "Chrome on macOS",
    };
    const { runtime } = await feedRuntime([login], {
      "GET /api/sessions": () => ({ sessions: [thisSession] }),
    });
    await renderScreen(<NotificationsScreen />, runtime);
    await screen.findByText(en("notifications.login", { name: "Chrome on macOS" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: en("notify.action.revoked") })).toBeNull();
    });
  });

  it("asks before Not me ends a session; Cancel keeps the notice as it was (QA round 15 L11)", async () => {
    const resolve = jest.fn(() => ({ notification: { ...login, resolution: "revoked" } }));
    const { runtime } = await feedRuntime([login], {
      "POST /api/notifications/n-login/resolve": resolve,
    });
    await renderScreen(<NotificationsScreen />, runtime);
    await fireEvent.press(await screen.findByRole("button", { name: en("notify.action.revoked") }));
    // The question is said, and focus lands on Cancel, the safe choice.
    expect(screen.getByText(en("notifications.notMeConfirm"))).toBeOnTheScreen();
    const [target, said] = mockMoveFocus.mock.calls.at(-1) ?? [];
    expect(said).toBe(en("notifications.notMeConfirm"));
    const cancel = screen.getByRole("button", { name: en("common.cancel") });
    expect(isControl(target, cancel)).toBe(true);
    await fireEvent.press(cancel);
    expect(screen.queryByText(en("notifications.notMeConfirm"))).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
    // Focus goes back to Not me.
    const [back] = mockMoveFocus.mock.calls.at(-1) ?? [];
    const notMe = screen.getByRole("button", { name: en("notify.action.revoked") });
    expect(isControl(back, notMe)).toBe(true);
  });

  it("marks this device's own sign-in as this device (QA round 15 L11)", async () => {
    const own = { ...login, payload: { ...login.payload, sessionId: "me" } };
    const { runtime } = await feedRuntime([own], { "GET /api/sessions": sessionsList(["me"]) });
    await renderScreen(<NotificationsScreen />, runtime);
    const row = await screen.findByTestId("notification-n-login");
    expect(await within(row).findByText(/^This device/u)).toBeOnTheScreen();
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("offers no Not me on a sign-in whose session already ended elsewhere: it says so (QA round 15 L11)", async () => {
    // The notice came on Oct 6; the list, fetched now, no longer holds its session "s".
    const { runtime } = await feedRuntime([login], { "GET /api/sessions": sessionsList(["me"]) });
    await renderScreen(<NotificationsScreen />, runtime);
    const row = await screen.findByTestId("notification-n-login");
    expect(await within(row).findByText(en("notify.resolved.revoked"))).toBeOnTheScreen();
    expect(within(row).queryByRole("button", { name: en("notify.action.revoked") })).toBeNull();
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
