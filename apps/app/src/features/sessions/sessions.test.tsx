import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import type { PaceRuntime } from "#app/runtime.ts";

import { serverStore } from "#app/platform/server-store.ts";
import { SettingsScreen } from "#app/screens/settings-screen.tsx";
import { isAtTextWidth } from "#app/test/button-width.ts";
import { deadControls } from "#app/test/dead-controls.ts";
import { isControl } from "#app/test/focus-target.ts";
import { renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
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

beforeEach(() => {
  jest.clearAllMocks();
  mockLayout.isWide = false;
  mockDevice.isPhone = true;
});

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
      within(screen.getByLabelText("Firefox on Linux")).getByText("Germany · 1.2.3.4"),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Claude")).toBeOnTheScreen();
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
    const runtime = await renderSettings(server.routes);
    const row = await screen.findByLabelText("Chrome on macOS");
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    expect(within(row).getByText("End this session? This device signs out.")).toBeOnTheScreen();
    await fireEvent.press(within(row).getByRole("button", { name: "Revoke" }));
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/login");
    });
    expect(server.deleted).toEqual(["01CHROME"]);
    expect(runtime.auth.token()).toBeUndefined();
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
    // The commands name the current server's API and web app, as it reports them.
    const serverApi = "https://pace-api.example.dev";
    const serverWeb = "https://pace.example.dev";
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
    expect(windowsLine).toHaveTextContent(`install --api ${serverApi} --name 'Work laptop'`, {
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
        `curl -fsSL ${serverWeb}/pace_agent.py -o ~/.pace_agent.py && python3 ~/.pace_agent.py install --api ${serverApi} --name 'Work laptop'`,
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

  it("shows how to connect an AI app: the server's MCP URL and the steps per client", async () => {
    const serverApi = "https://pace-api.example.dev";
    await renderSettings({
      "GET /api/instance": () => ({ ...fakeInstance, apiOrigin: serverApi }),
      "GET /api/sessions": () => SessionsOutputSchema.parse({ sessions: [] }),
    });
    await waitFor(() => {
      expect(serverStore.getState().instance?.apiOrigin).toBe(serverApi);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Connect an AI app" }));
    expect(await screen.findByText(`${serverApi}/mcp`)).toBeOnTheScreen();
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
});

type Rendered = NonNullable<typeof screen.root>;

/** The headings and the bottom buttons of Settings, top to bottom. */
const settingsOutline = (): readonly string[] => {
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
      "Theme",
      "Language",
      "Week",
      "Time zone",
      "Permissions",
      "Notifications",
      "Digest times",
      "Quiet hours",
      "Activity estimates",
      "More",
      "Devices and sessions",
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
      "Devices and sessions",
      "Export data",
      "Log out",
      "Danger zone",
    ]);
    expect(settingsOutline()).not.toContain("Permissions");
    expect(screen.queryByText(/Excel file/u)).toBeNull();
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
