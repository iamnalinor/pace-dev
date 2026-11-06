import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { AppState } from "react-native";

import type { PaceRuntime } from "#app/runtime.ts";

import { serverStore } from "#app/platform/server-store.ts";
import { SettingsScreen } from "#app/screens/settings-screen.tsx";
import { isAtTextWidth } from "#app/test/button-width.ts";
import { deadControls } from "#app/test/dead-controls.ts";
import { isControl } from "#app/test/focus-target.ts";
import { renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { REQUEST_DEADLINE_MS } from "@pace/client";
import { fakeInstance, type FakeRoute, problem } from "@pace/client/testing";
import { type Session, SessionsOutputSchema } from "@pace/core";

/* eslint-disable sonarjs/no-hardcoded-ip -- the address Cloudflare reports is these tests' fixture */

/** Whether the window is a computer's (from 1024 px): the sidebar, buttons sized to their text. */
const mockLayout = { isWide: false };
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => mockLayout.isWide,
}));

/** Where focus went and what was said, as the row asked the platform (bug class 5). */
const mockMoveFocus = jest.fn<undefined, [unknown, string | undefined]>();
jest.mock("#app/platform/move-focus.ts", (): unknown => ({
  moveFocus: (target: unknown, say?: string) => {
    mockMoveFocus(target, say);
  },
}));

/** Which field was given the cursor. */
const mockFocusField = jest.fn<undefined, [unknown]>();
jest.mock("#app/platform/focus-field.ts", (): unknown => ({
  focusField: (input: unknown) => {
    mockFocusField(input);
  },
}));

/** No keyboard (a phone) by default; a test may give the window one (a computer). */
const mockKeyboard: { os: "mac" | "other" | null } = { os: null };
jest.mock("#app/ui/use-hotkey.tsx", (): unknown => {
  const actual: object = jest.requireActual("#app/ui/use-hotkey.tsx");
  return Object.defineProperty({ ...actual }, "KEYBOARD", { get: () => mockKeyboard.os });
});

/** The Android app by default; a test may render the web build's Settings instead. */
const mockDevice = { isPhone: true };
jest.mock("#app/platform/device.ts", (): unknown => ({
  get IS_PHONE() {
    return mockDevice.isPhone;
  },
}));
// The web build's export (a download), as Metro swaps it in there.
jest.mock("#app/features/settings/export-row.tsx", (): unknown =>
  jest.requireActual("#app/features/settings/export-row.web.tsx"),
);
/** The files the browser was handed. */
const mockDownloads = jest.fn<Promise<void>, [unknown, string]>(async () => {
  await Promise.resolve();
});
jest.mock("#app/platform/xlsx.web.ts", (): unknown => ({
  downloadXlsx: async (sheets: unknown, fileName: string) => {
    await mockDownloads(sheets, fileName);
  },
}));

/** 10:39 on Oct 13 in Moscow, the account's zone. */
const NOW = "2026-10-13T07:39:00.000Z";
const MINUTE = 60_000;
const before = (minutes: number): string =>
  new Date(Date.parse(NOW) - minutes * MINUTE).toISOString();

const session = (overrides: Partial<Session> & Pick<Session, "id" | "name">): Session => ({
  city: null,
  country: null,
  createdAt: Date.parse("2026-10-01T10:00:00.000Z"),
  current: false,
  ip: null,
  kind: "browser",
  lastDataAt: null,
  lastSeenAt: Date.parse(before(30)),
  ...overrides,
});

const THIS_BROWSER = session({
  current: true,
  id: "01CHROME",
  lastSeenAt: Date.parse(NOW),
  name: "Chrome on macOS",
});
const OTHER_BROWSER = session({
  country: "DE",
  id: "01FIREFOX",
  ip: "1.2.3.4",
  lastSeenAt: Date.parse(before(20)),
  name: "Firefox on Linux",
});
const PHONE = session({ id: "01PIXEL", kind: "app", lastDataAt: before(130), name: "Pixel 9a" });
const AGENT = session({
  id: "01MINT",
  kind: "agent",
  lastDataAt: before(11 * 60 + 29),
  lastSeenAt: Date.parse(before(11 * 60 + 29)),
  name: "Linux Mint",
});
const MCP = session({
  id: "mcp:g1",
  kind: "mcp",
  lastSeenAt: null,
  name: "Claude",
  scopes: ["tasks:read"],
});

/** A server holding `sessions`, which a revoke takes out; every DELETE path it got, in order. */
const sessionsServer = (initial: readonly Session[]) => {
  const state = { sessions: [...initial] };
  const deleted: string[] = [];
  const routes: Record<string, FakeRoute> = {
    // Answers go through the endpoint's own output schema (bug class 12).
    "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: state.sessions }),
  };
  for (const item of initial) {
    routes[`DELETE /api/sessions/${encodeURIComponent(item.id)}`] = () => {
      deleted.push(item.id);
      state.sessions = state.sessions.filter((other) => other.id !== item.id);
      return { ok: true };
    };
  }
  return { deleted, routes };
};

const signedIn = async (routes: Readonly<Record<string, FakeRoute>>): Promise<PaceRuntime> => {
  const runtime = await createTestRuntime({ now: NOW, routes });
  await runtime.auth.adoptToken("session-settings");
  return runtime;
};

const renderSettings = async (routes: Readonly<Record<string, FakeRoute>>) => {
  const runtime = await signedIn(routes);
  await renderScreen(<SettingsScreen />, runtime);
  return runtime;
};

const ALL = [AGENT, MCP, PHONE, OTHER_BROWSER, THIS_BROWSER];

// eslint-disable-next-line @typescript-eslint/unbound-method -- inspecting the jest mock, never calling it
const appStateListeners = jest.mocked(AppState.addEventListener);

/** The app as AppState says it is: back to the front ("active") or away. */
const appStateIs = async (next: "active" | "background"): Promise<void> => {
  await act(async () => {
    for (const [type, listener] of appStateListeners.mock.calls) {
      if (type === "change") {
        listener(next);
      }
    }
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockKeyboard.os = null;
  mockLayout.isWide = false;
  mockDevice.isPhone = true;
});

/** The session rows' names, top to bottom. */
const rowNames = (): readonly string[] =>
  (
    screen.root?.queryAll(
      (node) =>
        typeof node.type === "string" &&
        node.props["role"] === "group" &&
        ALL.some((item) => item.name === node.props["aria-label"]),
    ) ?? []
  ).map((node) => String(node.props["aria-label"]));

describe("Settings → Devices and sessions", () => {
  it("shows skeleton rows while the list loads, then every session worded for the viewer", async () => {
    const answer: { release?: () => void } = {};
    const pending = new Promise<void>((resolve) => {
      answer.release = resolve;
    });
    await renderSettings({
      "GET /api/sessions": async () => {
        await pending;
        return SessionsOutputSchema.parse({ sessions: ALL });
      },
    });
    expect(await screen.findByLabelText("Loading devices")).toBeOnTheScreen();
    expect(screen.queryByText(/Loading/u)).toBeNull();

    await act(async () => {
      answer.release?.();
      await pending;
    });
    const current = await screen.findByLabelText("Chrome on macOS");
    expect(within(current).getByText("This device")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Loading devices")).toBeNull();
    expect(
      within(screen.getByLabelText("Pixel 9a")).getByText("Last data 2h 10m ago"),
    ).toBeOnTheScreen();
    // Older than eight hours: the exact time in the account's zone, not a duration.
    expect(
      within(screen.getByLabelText("Linux Mint")).getByText("Last data Oct 12, 23:10"),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByLabelText("Firefox on Linux")).getByLabelText(
        "Browser, Germany, 1.2.3.4, Signed in Oct 1, 13:00",
      ),
    ).toBeOnTheScreen();
    // Every row names its kind in words; an AI app has a line too (QA round 15 L5).
    expect(within(screen.getByLabelText("Claude")).getByText(/^AI app/u)).toBeOnTheScreen();
    expect(
      within(screen.getByLabelText("Claude")).getByText("Added Oct 1, 13:00"),
    ).toBeOnTheScreen();
    expect(within(screen.getByLabelText("Linux Mint")).getByText(/^Computer/u)).toBeOnTheScreen();
    // The current session first.
    const names = (
      screen.root?.queryAll(
        (node) =>
          typeof node.type === "string" &&
          ALL.some((item) => item.name === node.props["aria-label"]),
      ) ?? []
    ).map((node) => node.props["aria-label"] as unknown);
    expect(names[0]).toBe("Chrome on macOS");
  });

  it("asks before revoking, keeps the row on Cancel and sends one request however fast the presses", async () => {
    const server = sessionsServer(ALL);
    await renderSettings(server.routes);
    const row = await screen.findByLabelText("Firefox on Linux");
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    expect(within(row).getByText("End this session?")).toBeOnTheScreen();
    await fireEvent.press(within(row).getByRole("button", { name: "Cancel" }));
    expect(within(row).queryByText("End this session?")).toBeNull();
    expect(server.deleted).toEqual([]);

    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    const confirm = within(row).getByRole("button", { name: "Revoke" });
    // Two presses in one batch: the latch is synchronous (bug class 36).
    await act(async () => {
      void fireEvent.press(confirm);
      void fireEvent.press(confirm);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Firefox on Linux")).toBeNull();
    });
    expect(server.deleted).toEqual(["01FIREFOX"]);
    expect(screen.getByLabelText("Chrome on macOS")).toBeOnTheScreen();
  });

  it("moves focus into the confirm and says its question, and gives focus back on Cancel", async () => {
    await renderSettings(sessionsServer(ALL).routes);
    const row = await screen.findByLabelText("Firefox on Linux");
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    // The question is announced: a polite live region, and the confirm is named by it.
    const question = within(row).getByText("End this session?");
    expect(question.props).toMatchObject({ accessibilityLiveRegion: "polite", role: "status" });
    expect(within(row).getByLabelText("End this session?")).toBeOnTheScreen();
    // Focus lands on Cancel (the safe choice), saying the question on the way.
    expect(mockMoveFocus).toHaveBeenCalledTimes(1);
    const [cancelTarget, said] = mockMoveFocus.mock.calls[0] ?? [];
    expect(said).toBe("End this session?");
    expect(isControl(cancelTarget, within(row).getByRole("button", { name: "Cancel" }))).toBe(true);

    await fireEvent.press(within(row).getByRole("button", { name: "Cancel" }));
    expect(mockMoveFocus).toHaveBeenCalledTimes(2);
    const [backTarget, saidBack] = mockMoveFocus.mock.calls[1] ?? [];
    expect(saidBack).toBeUndefined();
    expect(isControl(backTarget, within(row).getByRole("button", { name: "Revoke" }))).toBe(true);
  });

  it("keeps one confirm open at a time: opening another closes the first (QA round 15 L1)", async () => {
    await renderSettings(sessionsServer(ALL).routes);
    const browser = await screen.findByLabelText("Firefox on Linux");
    const computer = screen.getByLabelText("Linux Mint");
    await fireEvent.press(within(browser).getByRole("button", { name: "Revoke" }));
    expect(within(browser).getByText("End this session?")).toBeOnTheScreen();
    await fireEvent.press(within(computer).getByRole("button", { name: "Disconnect" }));
    expect(
      within(computer).getByText("Disconnect this computer? Its token stops working at once."),
    ).toBeOnTheScreen();
    expect(within(browser).queryByText("End this session?")).toBeNull();
    expect(within(browser).getByRole("button", { name: "Revoke" })).toBeOnTheScreen();
  });

  it("reloads the list when the person comes back and when a sign-in notice arrives (QA round 15 M1)", async () => {
    const listed = { sessions: [...ALL] };
    const lists = { count: 0 };
    const runtime = await renderSettings({
      "GET /api/sessions": () => {
        lists.count += 1;
        return SessionsOutputSchema.parse({ sessions: listed.sessions });
      },
    });
    await screen.findByLabelText("Firefox on Linux");
    // The feed's first load is no news: the list already shows what it says.
    await act(async () => {
      runtime.notifications.store.setState({ status: "ready" });
      await Promise.resolve();
    });
    expect(lists.count).toBe(1);
    // A computer added elsewhere shows once the person returns to the app or the tab.
    listed.sessions = [...ALL, session({ id: "01NEW", kind: "agent", name: "New laptop" })];
    await appStateIs("active");
    expect(await screen.findByLabelText("New laptop")).toBeOnTheScreen();
    // A sign-in elsewhere arrives live as a notice: the list follows it without a return.
    listed.sessions = [...listed.sessions, session({ id: "01EDGE", name: "Edge on Windows" })];
    await act(async () => {
      runtime.notifications.store.setState((state) => ({
        ...state,
        items: [
          {
            createdAt: NOW,
            id: "n-edge",
            kind: "login",
            payload: {
              country: "",
              ip: "",
              kind: "web",
              name: "Edge on Windows",
              sessionId: "01EDGE",
            },
            readAt: null,
            resolution: null,
            resolvedAt: null,
          },
          ...state.items,
        ],
      }));
      await Promise.resolve();
    });
    expect(await screen.findByLabelText("Edge on Windows")).toBeOnTheScreen();
    // A background trip is no return: nothing is asked while the app is away.
    const before = lists.count;
    await appStateIs("background");
    expect(lists.count).toBe(before);
  });

  it("disconnects a computer and revokes an MCP app, each asked first", async () => {
    const server = sessionsServer(ALL);
    await renderSettings(server.routes);
    const computer = await screen.findByLabelText("Linux Mint");
    expect(within(computer).queryByRole("button", { name: "Revoke" })).toBeNull();
    await fireEvent.press(within(computer).getByRole("button", { name: "Disconnect" }));
    expect(
      within(computer).getByText("Disconnect this computer? Its token stops working at once."),
    ).toBeOnTheScreen();
    await fireEvent.press(within(computer).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Linux Mint")).toBeNull();
    });

    const app = screen.getByLabelText("Claude");
    await fireEvent.press(within(app).getByRole("button", { name: "Revoke" }));
    expect(within(app).getByText("Revoke this app's access?")).toBeOnTheScreen();
    await fireEvent.press(within(app).getByRole("button", { name: "Revoke" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Claude")).toBeNull();
    });
    expect(server.deleted).toEqual(["01MINT", "mcp:g1"]);
  });

  it("signs out and goes to the login card when the session ended is this device's", async () => {
    const server = sessionsServer(ALL);
    const logouts = { count: 0 };
    // Whether the socket had rested when the DELETE reached the server.
    const atDelete: { stopsBefore: number; sync?: unknown } = { stopsBefore: -1 };
    const stops = { count: 0 };
    const deleteRoute = server.routes["DELETE /api/sessions/01CHROME"];
    const runtime = await renderSettings({
      ...server.routes,
      "DELETE /api/sessions/01CHROME": async (request) => {
        atDelete.stopsBefore = stops.count;
        // Nothing of the sync goes out meanwhile: it would answer 401 once the session is gone.
        atDelete.sync = await runtime.sync.syncNow();
        return deleteRoute?.(request);
      },
      "POST /api/auth/logout": () => {
        logouts.count += 1;
        return { ok: true };
      },
    });
    const row = await screen.findByLabelText("Chrome on macOS");
    const { stop } = runtime.live;
    jest.spyOn(runtime.live, "stop").mockImplementation(() => {
      stops.count += 1;
      stop();
    });
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    expect(within(row).getByText("End this session? This device signs out.")).toBeOnTheScreen();
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    await waitFor(() => {
      expect(runtime.auth.store.getState().status).toBe("signed-out");
    });
    // The route gate takes a signed-out device to the login card; no navigation of its own (N1).
    expect(router.replace).not.toHaveBeenCalled();
    expect(server.deleted).toEqual(["01CHROME"]);
    expect(runtime.auth.token()).toBeUndefined();
    // The server ended it already: no logout that would answer 401 (QA round 15 L2).
    expect(logouts.count).toBe(0);
    // The socket rested before the DELETE: the server's close of it cannot read as "elsewhere".
    expect(atDelete.stopsBefore).toBe(1);
    expect(atDelete.sync).toEqual({ error: "stopped", ok: false });
    expect(runtime.auth.store.getState().endedElsewhere).toBeUndefined();
  });

  it("gives up ending this device when the server never answers: sync and socket come back (round 7 review 2)", async () => {
    const calls = { deletes: 0, pulls: 0 };
    const runtime = await signedIn({
      "DELETE /api/sessions/01CHROME": async () => {
        calls.deletes += 1;
        return await new Promise<never>(() => undefined);
      },
      "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: ALL }),
      "GET /api/sync/pull": () => {
        calls.pulls += 1;
        return { events: [], more: false, seq: 0, storeId: "store-test" };
      },
    });
    const starts = jest.spyOn(runtime.live, "start");
    jest.useFakeTimers();
    try {
      await renderScreen(<SettingsScreen />, runtime);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
      });
      const row = screen.getByLabelText("Chrome on macOS");
      await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
      await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
      const startsBefore = starts.mock.calls.length;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
      });
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't end the session. Try again.");
      expect(runtime.auth.store.getState().status).toBe("signed-in");
      expect(runtime.auth.isEnding()).toBe(false);
      // The socket is back, and the sync loop runs again on its own (not only a socket).
      expect(starts.mock.calls.length).toBeGreaterThan(startsBefore);
      const pullsAfter = calls.pulls;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(31_000);
      });
      expect(calls.pulls).toBeGreaterThan(pullsAfter);
      // The steady state: one DELETE, and the loop at its interval, not a burst.
      expect(calls.deletes).toBe(1);
      expect(calls.pulls - pullsAfter).toBeLessThanOrEqual(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("says so quietly when a revoke fails, and keeps the row", async () => {
    await renderSettings({
      "DELETE /api/sessions/01FIREFOX": () => problem(500, "server/error"),
      "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: ALL }),
    });
    const row = await screen.findByLabelText("Firefox on Linux");
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't end the session. Try again.",
    );
    expect(screen.getByLabelText("Firefox on Linux")).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("takes a session already ended elsewhere as ended: the row goes, the list reloads, no failure (QA round 15 M1)", async () => {
    const listed = { sessions: [...ALL] };
    const lists = { count: 0 };
    await renderSettings({
      // Ended from another device meanwhile: the server has no such session any more.
      "DELETE /api/sessions/01FIREFOX": () => problem(404, "session/not-found"),
      "GET /api/sessions": () => {
        lists.count += 1;
        return SessionsOutputSchema.parse({ sessions: listed.sessions });
      },
    });
    const row = await screen.findByLabelText("Firefox on Linux");
    // Meanwhile a computer was added elsewhere and the browser ended: the reload shows both.
    const added = session({ id: "01NEW", kind: "agent", name: "New laptop" });
    listed.sessions = [...ALL.filter((item) => item.id !== OTHER_BROWSER.id), added];
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Firefox on Linux")).toBeNull();
    });
    expect(await screen.findByLabelText("New laptop")).toBeOnTheScreen();
    expect(lists.count).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("moves focus to the next row's action once a session is ended, so it never drops to the page (QA round 15 M4)", async () => {
    await renderSettings(sessionsServer(ALL).routes);
    const row = await screen.findByLabelText("Firefox on Linux");
    const names = rowNames();
    const next = names[names.indexOf("Firefox on Linux") + 1] ?? "";
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Firefox on Linux")).toBeNull();
    });
    const [target] = mockMoveFocus.mock.calls.at(-1) ?? [];
    const nextAction = within(screen.getByLabelText(next)).getByRole("button", {
      name: /^(?:Revoke|Disconnect)$/u,
    });
    expect(isControl(target, nextAction)).toBe(true);
  });

  it("moves focus to Add a computer when the last row is ended", async () => {
    await renderSettings(sessionsServer([THIS_BROWSER, OTHER_BROWSER]).routes);
    const row = await screen.findByLabelText("Firefox on Linux");
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Firefox on Linux")).toBeNull();
    });
    const [target] = mockMoveFocus.mock.calls.at(-1) ?? [];
    expect(isControl(target, screen.getByRole("button", { name: "Add a computer" }))).toBe(true);
  });

  it("gives focus back to the confirm's action when a revoke fails", async () => {
    await renderSettings({
      "DELETE /api/sessions/01FIREFOX": () => problem(500, "server/error"),
      "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: ALL }),
    });
    const row = await screen.findByLabelText("Firefox on Linux");
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    const confirm = within(row).getByLabelText("End this session?");
    await fireEvent.press(within(confirm).getByRole("button", { name: "Revoke" }));
    await screen.findByRole("alert");
    const [target] = mockMoveFocus.mock.calls.at(-1) ?? [];
    expect(isControl(target, within(confirm).getByRole("button", { name: "Revoke" }))).toBe(true);
  });

  it("puts the question above Cancel and the action, in that order, on a phone and a computer (QA round 15 M3)", async () => {
    for (const isWide of [false, true]) {
      mockLayout.isWide = isWide;
      await renderSettings(sessionsServer(ALL).routes);
      const row = await screen.findByLabelText("Firefox on Linux");
      await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
      const confirm = within(row).getByLabelText("End this session?");
      expect(within(confirm).getByText("End this session?")).toBeOnTheScreen();
      // The two buttons share a row of their own, under the question, Cancel first.
      const [actions] = confirm.queryAll(
        (node) =>
          typeof node.type === "string" &&
          /\bflex-row\b/u.test(String(node.props["className"] ?? "")) &&
          within(node).queryAllByRole("button").length === 2,
      );
      expect(actions).toBeDefined();
      if (actions === undefined) {
        return;
      }
      expect(within(actions).queryByText("End this session?")).toBeNull();
      const labels = within(actions)
        .getAllByRole("button")
        .map((button) =>
          String(within(button).getByText(/^(?:Cancel|Revoke)$/u).props["children"]),
        );
      expect(labels).toEqual(["Cancel", "Revoke"]);
      await screen.unmount();
    }
  });

  it("offers Try again when the list never comes, instead of grey rows for good (round 6, class 62)", async () => {
    const calls = { count: 0 };
    const runtime = await signedIn({
      "GET /api/sessions": async () => {
        calls.count += 1;
        if (calls.count === 1) {
          await new Promise<never>(() => undefined);
        }
        return SessionsOutputSchema.parse({ sessions: ALL });
      },
    });
    jest.useFakeTimers();
    try {
      await renderScreen(<SettingsScreen />, runtime);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
      });
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByLabelText("Chrome on macOS")).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it("offers Try again when the list cannot load, which loads it again", async () => {
    const answers = { failing: true };
    await renderSettings({
      "GET /api/sessions": () =>
        answers.failing
          ? problem(500, "server/error")
          : SessionsOutputSchema.parse({ sessions: ALL }),
    });
    expect(await screen.findByText("Couldn't load devices")).toBeOnTheScreen();
    answers.failing = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Pixel 9a")).toBeOnTheScreen();
    expect(screen.queryByText("Couldn't load devices")).toBeNull();
  });

  it("adds a computer: install commands omit the separately displayed token", async () => {
    // The commands name the API the app reaches the server at (the server reports another one,
    // QA round 18 L10), and the web app the server reports.
    const serverApi = "https://pace-api.example.dev";
    const serverWeb = "https://pace.example.dev";
    const usedApi = serverStore.getState().origin;
    expect(usedApi).not.toBe(serverApi);
    const listed: Session[] = [];
    await renderSettings({
      "GET /api/instance": () => ({ ...fakeInstance, apiOrigin: serverApi, webOrigin: serverWeb }),
      "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: listed }),
      "POST /api/sessions/agents": ({ body }) => {
        const { name } = body as { name: string };
        listed.push(session({ id: "01NEW", kind: "agent", name }));
        return { id: "01NEW", name, token: "tok_secret" };
      },
    });
    await waitFor(() => {
      expect(serverStore.getState().instance?.apiOrigin).toBe(serverApi);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Add a computer" }));
    await fireEvent.changeText(screen.getByLabelText("Name"), "Work laptop");
    await fireEvent.press(screen.getByRole("button", { name: "Create the token" }));

    // Not on a computer here, so Windows comes first: PowerShell, Python if missing, the agent.
    const picker = await screen.findByLabelText("The computer's system");
    expect(within(picker).getByRole("radio", { name: "Windows" })).toBeChecked();
    expect(screen.getByText(/open PowerShell/u)).toBeOnTheScreen();
    const windowsLine = screen.getByText(/winget install -e --id Python\.Python\.3\.12/u);
    expect(windowsLine).toHaveTextContent(
      `Invoke-WebRequest -UseBasicParsing ${serverWeb}/pace_agent.py`,
      { exact: false },
    );
    expect(windowsLine).toHaveTextContent(`install --api ${usedApi} --name 'Work laptop'`, {
      exact: false,
    });
    expect(windowsLine).not.toHaveTextContent("tok_secret");
    expect(screen.getByText("tok_secret")).toBeOnTheScreen();
    expect(screen.getByText(/hidden prompt/u)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send the token" })).toBeOnTheScreen();
    expect(
      screen.getByText(String.raw`py "$env:APPDATA\Pace\pace_agent.py" run --logs`),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/ActivityWatch/u)).toBeNull();

    // Linux: the packages first, then curl and python3.
    await fireEvent.press(within(picker).getByRole("radio", { name: "Linux" }));
    expect(within(picker).getByRole("radio", { name: "Linux" })).toBeChecked();
    expect(screen.getByText(/sudo apt install xdotool xprintidle/u)).toBeOnTheScreen();
    expect(screen.getByText(/GNOME on Wayland/u)).toBeOnTheScreen();
    expect(
      screen.getByText(
        `curl -fsSL ${serverWeb}/pace_agent.py -o ~/.pace_agent.py && python3 ~/.pace_agent.py install --api ${usedApi} --name 'Work laptop'`,
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/winget/u)).toBeNull();

    // macOS: the same line, in Terminal, without the Linux packages.
    await fireEvent.press(within(picker).getByRole("radio", { name: "macOS" }));
    expect(screen.getByText(/open Terminal/u)).toBeOnTheScreen();
    expect(screen.getByText(/^curl -fsSL .* install --api/u)).toBeOnTheScreen();
    expect(screen.queryByText(/xprintidle/u)).toBeNull();
    expect(screen.getByText("python3 ~/.pace_agent.py run --logs")).toBeOnTheScreen();
    expect(screen.getByText(/never window titles or URLs/u)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send the command" })).toBeOnTheScreen();

    // Done: the sheet closes and the same list (one instance) shows the new computer.
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByLabelText("Work laptop")).toBeOnTheScreen();
  });

  it("leaves the name unfocused on a touch screen: no on-screen keyboard over the sheet (QA round 20 L1)", async () => {
    await renderSettings({
      "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: [THIS_BROWSER] }),
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Add a computer" }));
    expect(screen.getByLabelText("Name")).toBeOnTheScreen();
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
    });
    expect(mockFocusField).not.toHaveBeenCalled();
  });

  it("adds a computer from the keyboard: the name is focused and selected, Enter creates the token once (QA round 15 M2)", async () => {
    mockKeyboard.os = "other";
    const created: string[] = [];
    await renderSettings({
      "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: [THIS_BROWSER] }),
      "POST /api/sessions/agents": ({ body }) => {
        const { name } = body as { name: string };
        created.push(name);
        return { id: "01NEW", name, token: "tok_secret" };
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Add a computer" }));
    const field = screen.getByLabelText("Name");
    expect(field.props).toMatchObject({ selectTextOnFocus: true });
    await waitFor(() => {
      expect(mockFocusField).toHaveBeenCalled();
    });
    expect(
      (mockFocusField.mock.calls[0]?.[0] as null | { props?: Record<string, unknown> })?.props?.[
        "accessibilityLabel"
      ],
    ).toBe("Name");
    await fireEvent.changeText(field, "Work laptop");
    // Enter twice in one batch: one token (bug class 36).
    await act(async () => {
      void fireEvent(field, "submitEditing");
      void fireEvent(field, "submitEditing");
      await Promise.resolve();
    });
    expect(await screen.findByText("tok_secret")).toBeOnTheScreen();
    expect(created).toEqual(["Work laptop"]);
    // The field went with the name step: focus moves to the next step's first control, the
    // chosen system, never to the page (QA round 16 L2).
    const [target] = mockMoveFocus.mock.calls.at(-1) ?? [];
    expect(isControl(target, screen.getByRole("radio", { checked: true, name: "Windows" }))).toBe(
      true,
    );
  });

  it("shows how to connect an AI app: the server's MCP URL and the steps per client", async () => {
    // The server names another public API than the address the app reaches it at (a phone on the
    // LAN, a Worker behind a proxy): MCP is OAuth-bound to that public one (`<API_ORIGIN>/mcp`, the
    // Worker's protected resource), so the URL is it, and a line says the two differ (round 7
    // review 1; QA round 18 L10's "the one in use" stays for the computer agent).
    const serverApi = "https://pace-api.example.dev";
    const usedApi = serverStore.getState().origin;
    expect(usedApi).not.toBe(serverApi);
    await renderSettings({
      "GET /api/instance": () => ({ ...fakeInstance, apiOrigin: serverApi }),
      "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: [] }),
    });
    await waitFor(() => {
      expect(serverStore.getState().instance?.apiOrigin).toBe(serverApi);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Connect an AI app" }));
    expect(await screen.findByText(`${serverApi}/mcp`)).toBeOnTheScreen();
    expect(screen.queryByText(`${usedApi}/mcp`)).toBeNull();
    // The line names both addresses and what to do (QA round 21 L6).
    expect(
      screen.getByText(
        `AI apps must use the address above, not the one this device uses (${usedApi}).`,
      ),
    ).toBeOnTheScreen();
    // A phone has no clipboard module: the URL goes on through the share sheet.
    expect(screen.getByRole("button", { name: "Send the URL" })).toBeOnTheScreen();
    expect(screen.getByText("Claude")).toBeOnTheScreen();
    expect(
      screen.getByText(/Settings → Connectors → Add custom connector, paste the URL/u),
    ).toBeOnTheScreen();
    expect(screen.getByText("ChatGPT")).toBeOnTheScreen();
    expect(screen.getByText(/developer mode/u)).toBeOnTheScreen();
    expect(screen.getByText(/Any MCP client with OAuth/u)).toBeOnTheScreen();
    // Leaving is the dim (or the cross, or Escape), as for every sheet.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByText(`${serverApi}/mcp`)).toBeNull();
    });
  });

  it("says AI apps cannot connect, with no URL to copy, on a server without MCP (re-review N4)", async () => {
    const usedApi = serverStore.getState().origin;
    await renderSettings({
      "GET /api/instance": () => ({
        ...fakeInstance,
        apiOrigin: usedApi,
        features: { ...fakeInstance.features, mcp: false },
      }),
      "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: [] }),
    });
    await waitFor(() => {
      expect(serverStore.getState().instance?.features.mcp).toBe(false);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Connect an AI app" }));
    expect(
      await screen.findByText("AI apps cannot connect to this server: they need an https address."),
    ).toBeOnTheScreen();
    expect(screen.queryByText(`${usedApi}/mcp`)).toBeNull();
    expect(screen.queryByRole("button", { name: "Send the URL" })).toBeNull();
    expect(screen.queryByText("Claude")).toBeNull();
  });

  it("says nothing about the address when the server's public API is the one in use", async () => {
    const usedApi = serverStore.getState().origin;
    await renderSettings({
      "GET /api/instance": () => ({ ...fakeInstance, apiOrigin: usedApi }),
      "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: [] }),
    });
    await waitFor(() => {
      expect(serverStore.getState().instance?.apiOrigin).toBe(usedApi);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Connect an AI app" }));
    expect(await screen.findByText(`${usedApi}/mcp`)).toBeOnTheScreen();
    expect(screen.queryByText(/AI apps must use the address above/u)).toBeNull();
  });
});

/** The headings and the bottom buttons of Settings, top to bottom. */
const settingsOutline = (): readonly string[] => {
  type Rendered = NonNullable<typeof screen.root>;
  const textOf = (node: Rendered | string): string =>
    typeof node === "string" ? node : node.children.map((child) => textOf(child)).join("");
  const isBottomButton = (node: Rendered): boolean =>
    node.props["accessibilityRole"] === "button" &&
    ["Export data", "Log out"].includes(textOf(node));
  return (
    screen.root?.queryAll(
      (node) =>
        typeof node.type === "string" &&
        (node.props["accessibilityRole"] === "header" || isBottomButton(node)),
    ) ?? []
  ).map((node) => textOf(node));
};

describe("Settings' order", () => {
  it("puts the preferences first, then devices and sessions, log out and the danger zone last", async () => {
    await renderSettings(sessionsServer([THIS_BROWSER]).routes);
    await screen.findByLabelText("Chrome on macOS");
    expect(settingsOutline().filter((text) => text !== "Settings")).toEqual([
      "Account and language",
      "Notifications",
      "Tasks",
      "Devices and sessions",
      "Appearance",
      "Permissions",
      "Server",
      // Export data is the web build's (a download); a phone has none.
      "Log out",
      "Danger zone",
    ]);
  });

  it("on the web, has no permissions and puts Export data, without a description, above Log out", async () => {
    mockDevice.isPhone = false;
    await renderSettings(sessionsServer([THIS_BROWSER]).routes);
    await screen.findByLabelText("Chrome on macOS");
    expect(settingsOutline().slice(-4)).toEqual([
      "Appearance",
      "Export data",
      "Log out",
      "Danger zone",
    ]);
    expect(settingsOutline()).not.toContain("Permissions");
    expect(screen.queryByText(/Excel file/u)).toBeNull();
  });

  it("says how the web gets notifications, where the phone has its method picker (QA round 15 L12)", async () => {
    mockDevice.isPhone = false;
    await renderSettings(sessionsServer([THIS_BROWSER]).routes);
    expect(
      await screen.findByText(
        "In a browser, notifications wait under the bell; the browser itself shows none.",
      ),
    ).toBeOnTheScreen();
  });

  it("says what Export data downloaded (QA round 15 L6)", async () => {
    mockDevice.isPhone = false;
    await renderSettings(sessionsServer([THIS_BROWSER]).routes);
    await fireEvent.press(await screen.findByRole("button", { name: "Export data" }));
    await waitFor(() => {
      expect(mockDownloads).toHaveBeenCalledWith(expect.anything(), "pace-2026-10-13.xlsx");
    });
    expect(await screen.findByText("Downloaded pace-2026-10-13.xlsx")).toBeOnTheScreen();
  });
});

/** Whether the first button named `name` is stretched to its container (not kept to its text). */
const isStretched = (name: string): boolean => {
  const [button] = screen.getAllByRole("button", { name });
  return button !== undefined && !isAtTextWidth(button);
};

describe("Settings' buttons", () => {
  it("size to their text on a computer's window", async () => {
    mockLayout.isWide = true;
    await renderSettings(sessionsServer(ALL).routes);
    await screen.findByLabelText("Firefox on Linux");
    expect(isStretched("Revoke")).toBe(false);
    expect(isStretched("Add a computer")).toBe(false);
    expect(isStretched("Connect an AI app")).toBe(false);
    expect(isStretched("Log out")).toBe(false);
  });

  it("fill a phone's width where they are the main action", async () => {
    await renderSettings(sessionsServer(ALL).routes);
    await screen.findByLabelText("Firefox on Linux");
    expect(isStretched("Log out")).toBe(true);
    expect(isStretched("Add a computer")).toBe(true);
  });

  it("all do something when pressed on a phone (bug class 10)", async () => {
    const dead = await deadControls(async () => {
      const server = sessionsServer(ALL);
      const runtime = await renderSettings({
        ...server.routes,
        "POST /api/sessions/agents": () => ({ id: "01NEW", name: "My computer", token: "tok" }),
      });
      await screen.findByLabelText("Firefox on Linux");
      return { extra: () => runtime.state.store.getState().log.length };
    });
    expect(dead).toEqual([]);
  }, 120_000);
});
/* eslint-enable sonarjs/no-hardcoded-ip -- the fixtures and their assertions end here */
