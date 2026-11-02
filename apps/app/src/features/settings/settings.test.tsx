import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";

import * as firebaseProject from "#app/platform/firebase-project.ts";
import { pushStore, registerPush, setPushChoice } from "#app/platform/notifications.ts";
import { SettingsScreen } from "#app/screens/settings-screen.tsx";
import { isControl } from "#app/test/focus-target.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { problem } from "@pace/client/testing";

import { paceNative } from "../../../modules/pace-native/index.ts";

/** Where focus went and what was said, as a confirm asked the platform (bug class 5). */
const mockMoveFocus = jest.fn<undefined, [unknown, string | undefined]>();
jest.mock("#app/platform/move-focus.ts", (): unknown => ({
  moveFocus: (target: unknown, say?: string) => {
    mockMoveFocus(target, say);
  },
}));

const mockPendingConfirmation = {
  current: null as null | {
    readonly action: "delete" | "wipe";
    readonly request: { readonly id: string; readonly expiresAt: string };
  },
};

jest.mock("./confirmation-pending.ts", () => ({
  clearPendingConfirmation: () => {
    mockPendingConfirmation.current = null;
  },
  readPendingConfirmation: () => mockPendingConfirmation.current,
  savePendingConfirmation: (pending: typeof mockPendingConfirmation.current) => {
    mockPendingConfirmation.current = pending;
  },
}));

/** Settings' switch for Week's night hours. */
const nightHours = () => screen.getByRole("switch", { name: en("settings.nightHours") });

beforeEach(() => {
  jest.clearAllMocks();
  mockPendingConfirmation.current = null;
});

type Rendered = NonNullable<typeof screen.root>;

/** The role of the nearest element above `node` that has one. */
const roleAbove = (node: Rendered): unknown => {
  const { parent } = node;
  if (parent === null) {
    return null;
  }
  const role: unknown =
    typeof parent.type === "string"
      ? (parent.props["role"] ?? parent.props["accessibilityRole"])
      : undefined;
  return role ?? roleAbove(parent);
};

const fakeNotifications = Notifications as unknown as {
  state: { granted: boolean; pushToken: null | string };
};

/** A server offering Google's push and polling, recording what the phone registers. */
const pushRoutes = () => {
  const registered: unknown[] = [];
  return {
    registered,
    routes: {
      "GET /api/push/methods": () => ({ pushMethods: ["fcm", "poll"] }),
      "PUT /api/push/subscription": ({ body }: { readonly body: unknown }) => {
        registered.push(body);
        return { method: (body as { method: string }).method };
      },
    },
  };
};

describe("SettingsScreen", () => {
  it("saves digest times as they are typed, adds and removes one", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    const settings = () => runtime.state.store.getState().settings;
    const first = screen.getByLabelText(en("settings.digestWindows.time", { index: 1 }));
    await fireEvent.changeText(first, "8");
    // Half a time is never stored.
    expect(settings().digestWindows[0]).toBe("09:00");
    await fireEvent.changeText(first, "0830");
    await waitFor(() => {
      expect(settings().digestWindows[0]).toBe("08:30");
    });
    await fireEvent.press(screen.getByRole("button", { name: en("settings.digestWindows.add") }));
    await waitFor(() => {
      expect(settings().digestWindows).toHaveLength(4);
    });
    await fireEvent.press(
      screen.getByRole("button", { name: en("settings.digestWindows.remove", { time: "12:00" }) }),
    );
    await waitFor(() => {
      expect(settings().digestWindows).toHaveLength(3);
    });
  });

  it("saves the quiet hours and opens the pages behind the links", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    await fireEvent.changeText(screen.getByLabelText(en("settings.quietHours.from")), "2230");
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.quietHours.from).toBe("22:30");
    });
    const presetsLink = `${en("settings.presets")} ${en("settings.presets.hint")}`;
    await fireEvent.press(screen.getByRole("link", { name: presetsLink }));
    expect(router.push).toHaveBeenCalledWith("/presets");
  });

  it("turns Week's night hours on and off", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    expect(nightHours()).not.toBeChecked();
    await fireEvent(nightHours(), "valueChange", true);
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.nightHours).toBe(true);
    });
    expect(nightHours()).toBeChecked();
    await fireEvent(nightHours(), "valueChange", false);
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.nightHours).toBe(false);
    });
  });

  it("switches one kind of notification on one channel, the others as they were", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    // A table's rows hold cells: each switch sits in one (axe aria-required-children on the web).
    const switches = screen.getAllByRole("switch", { name: /^Sign-ins: |^Deadline digest: / });
    expect(switches).toHaveLength(6);
    expect(new Set(switches.map((item) => roleAbove(item)))).toEqual(new Set(["cell"]));
    const digestOnWeb = screen.getByLabelText(
      en("notify.switch", {
        channel: en("notify.channel.web"),
        kind: en("notify.kind.deadline_digest"),
      }),
    );
    expect(digestOnWeb).not.toBeChecked();
    await fireEvent(digestOnWeb, "valueChange", true);
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.notificationChannels.deadline_digest).toEqual({
        app: false,
        telegram: true,
        web: true,
      });
    });
    expect(digestOnWeb).toBeChecked();
  });

  it("picks how this phone shows notifications from what the server offers, and says which it uses", async () => {
    fakeNotifications.state.granted = true;
    fakeNotifications.state.pushToken = "fcm-token";
    const server = pushRoutes();
    const runtime = await createTestRuntime({ routes: server.routes, world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    const option = (method: "fcm" | "none" | "poll") =>
      screen.getByRole("radio", { name: en(`settings.push.option.${method}`) });
    await waitFor(() => {
      expect(option("fcm")).toBeOnTheScreen();
    });
    expect(option("poll")).toBeOnTheScreen();
    await fireEvent.press(option("none"));
    expect(await screen.findByText(en("settings.push.none"))).toBeOnTheScreen();
    expect(server.registered.at(-1)).toEqual({ method: "none" });
    expect(option("none")).toBeChecked();
    await fireEvent.press(option("poll"));
    expect(await screen.findByText(en("settings.push.poll"))).toBeOnTheScreen();
    expect(server.registered.at(-1)).toEqual({ method: "poll" });
    await fireEvent.press(option("fcm"));
    expect(await screen.findByText(en("settings.push.fcm"))).toBeOnTheScreen();
    expect(server.registered.at(-1)).toEqual({ endpoint: "fcm-token", method: "fcm" });
  });

  it("names each way plainly, and says the background check's rhythm", async () => {
    fakeNotifications.state.granted = true;
    fakeNotifications.state.pushToken = "fcm-token";
    const runtime = await createTestRuntime({ routes: pushRoutes().routes, world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    const option = (name: string) => screen.getByRole("radio", { name });
    await waitFor(() => {
      expect(option("Google")).toBeOnTheScreen();
    });
    expect(option("Automatic")).toBeOnTheScreen();
    expect(option("Background check (every ~15 min)")).toBeOnTheScreen();
    expect(option("Only in the app")).toBeOnTheScreen();
    await fireEvent.press(option("Background check (every ~15 min)"));
    expect(
      await screen.findByText(
        "Pace checks for notifications in the background about every 15 minutes, and at once while it is open.",
      ),
    ).toBeOnTheScreen();
    // Off on the phone: the open app shows none either, only its bell has them.
    await fireEvent.press(option("Only in the app"));
    expect(
      await screen.findByText("This phone shows no notifications; they are all in the app's bell."),
    ).toBeOnTheScreen();
  });

  it("goes back to automatic after a pick, which then uses what the server prefers", async () => {
    fakeNotifications.state.granted = true;
    fakeNotifications.state.pushToken = "fcm-token";
    const server = pushRoutes();
    const runtime = await createTestRuntime({ routes: server.routes, world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    const option = (method: "auto" | "fcm" | "none" | "poll") =>
      screen.getByRole("radio", { name: en(`settings.push.option.${method}`) });
    await waitFor(() => {
      expect(option("poll")).toBeOnTheScreen();
    });
    await fireEvent.press(option("poll"));
    expect(await screen.findByText(en("settings.push.poll"))).toBeOnTheScreen();
    await fireEvent.press(option("auto"));
    expect(await screen.findByText(en("settings.push.fcm"))).toBeOnTheScreen();
    expect(option("auto")).toBeChecked();
    expect(pushStore.getState().choice).toBeNull();
    expect(server.registered.at(-1)).toEqual({ endpoint: "fcm-token", method: "fcm" });
  });

  it("follows the server's methods while Settings is open", async () => {
    fakeNotifications.state.granted = true;
    fakeNotifications.state.pushToken = "fcm-token";
    const offered = { pushMethods: ["poll"] };
    const runtime = await createTestRuntime({
      routes: {
        ...pushRoutes().routes,
        "GET /api/push/methods": () => offered,
      },
      world: "empty",
    });
    await setPushChoice(null);
    await renderScreen(<SettingsScreen />, runtime);
    const google = () => screen.queryByRole("radio", { name: en("settings.push.option.fcm") });
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: en("settings.push.option.poll") }),
      ).toBeOnTheScreen();
    });
    expect(google()).toBeNull();
    // The server takes Google's push again: the live notice registers the phone anew.
    offered.pushMethods = ["fcm", "poll"];
    await act(async () => {
      await registerPush(runtime.api);
    });
    expect(google()).toBeOnTheScreen();
    expect(await screen.findByText(en("settings.push.fcm"))).toBeOnTheScreen();
  });

  it("says Google's push cannot work when the server sends with another Firebase project", async () => {
    fakeNotifications.state.granted = true;
    fakeNotifications.state.pushToken = "fcm-token";
    jest.spyOn(firebaseProject, "appFirebaseProject").mockReturnValue("pace-app");
    const runtime = await createTestRuntime({
      routes: {
        ...pushRoutes().routes,
        "GET /api/push/methods": () => ({
          fcmProject: "pace-selfhosted",
          pushMethods: ["fcm", "poll"],
        }),
      },
      world: "empty",
    });
    await setPushChoice(null);
    await renderScreen(<SettingsScreen />, runtime);
    expect(await screen.findByText(en("settings.push.otherProject"))).toBeOnTheScreen();
    expect(screen.queryByRole("radio", { name: en("settings.push.option.fcm") })).toBeNull();
    expect(screen.getByRole("radio", { name: en("settings.push.option.poll") })).toBeOnTheScreen();
    jest.restoreAllMocks();
  });

  it("keeps the picked method shown and selected while offline", async () => {
    fakeNotifications.state.granted = true;
    fakeNotifications.state.pushToken = "fcm-token";
    const runtime = await createTestRuntime({
      routes: { "GET /api/push/methods": () => problem(503, "offline") },
      world: "empty",
    });
    await setPushChoice("fcm");
    pushStore.setState({ method: "fcm", offered: null });
    await renderScreen(<SettingsScreen />, runtime);
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: en("settings.push.option.fcm") })).toBeChecked();
    });
    expect(screen.getByText(en("settings.push.fcm"))).toBeOnTheScreen();
  });

  it("asks for the battery exemption under the picker only while the background check is in use", async () => {
    fakeNotifications.state.granted = true;
    fakeNotifications.state.pushToken = "fcm-token";
    const exemption = { granted: false };
    jest
      .spyOn(paceNative, "isIgnoringBatteryOptimizations")
      .mockImplementation(() => exemption.granted);
    const request = jest
      .spyOn(paceNative, "requestIgnoreBatteryOptimizations")
      .mockImplementation(() => {
        exemption.granted = true;
      });
    const runtime = await createTestRuntime({ routes: pushRoutes().routes, world: "empty" });
    await setPushChoice(null);
    await renderScreen(<SettingsScreen />, runtime);
    const option = (method: "fcm" | "poll") =>
      screen.getByRole("radio", { name: en(`settings.push.option.${method}`) });
    const hint = () => screen.queryByLabelText(en("permissions.background"));
    await waitFor(() => {
      expect(option("poll")).toBeOnTheScreen();
    });
    expect(hint()).toBeNull();

    await fireEvent.press(option("poll"));
    const shown = await screen.findByLabelText(en("permissions.background"));
    expect(within(shown).getByText(en("permissions.background.why"))).toBeOnTheScreen();
    // Google's push wakes the phone itself: no exemption to ask for.
    await fireEvent.press(option("fcm"));
    await waitFor(() => {
      expect(hint()).toBeNull();
    });

    await fireEvent.press(option("poll"));
    const again = await screen.findByLabelText(en("permissions.background"));
    await fireEvent.press(within(again).getByRole("button", { name: en("permissions.allow") }));
    expect(request).toHaveBeenCalled();
    await waitFor(() => {
      expect(hint()).toBeNull();
    });
    jest.restoreAllMocks();
  });

  it("logs out and goes to the login card", async () => {
    await renderScreen(<SettingsScreen />, await createTestRuntime({ world: "empty" }));
    await fireEvent.press(screen.getByRole("button", { name: en("settings.logout") }));
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/login");
    });
  });

  it("waits for Telegram before deleting and can poll after the session disappears", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const created = jest.fn(() => ({
      id,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    }));
    await renderScreen(
      <SettingsScreen />,
      await createTestRuntime({
        routes: {
          "POST /api/account/confirmations": created,
          [`GET /api/account/confirmations/${id}`]: () => ({ status: "confirmed" }),
        },
        world: "empty",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: en("settings.deleteAccount") }));
    expect(created).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole("button", { name: en("settings.deleteAccount.confirm") }),
    );
    expect(screen.getByText(en("settings.confirmation.waiting"))).toBeOnTheScreen();
    await waitFor(
      () => {
        expect(router.replace).toHaveBeenCalledWith("/login");
      },
      { timeout: 4000 },
    );
    expect(created).toHaveBeenCalledTimes(1);
  });

  it("dresses Wipe and Delete as dangerous, and says both are confirmed in Telegram", async () => {
    await renderScreen(<SettingsScreen />, await createTestRuntime({ world: "empty" }));
    await fireEvent.press(screen.getByRole("button", { name: en("settings.deleteAccount") }));
    const remove = screen.getByRole("button", { name: en("settings.deleteAccount.confirm") });
    expect(en("settings.deleteAccount.confirm")).toMatch(/Telegram/u);
    expect(String(remove.props["className"])).toMatch(/border-warn/u);
    await fireEvent.press(screen.getByRole("button", { name: en("common.cancel") }));
    await fireEvent.press(screen.getByRole("button", { name: en("settings.wipe") }));
    const wipe = screen.getByRole("button", { name: en("settings.wipe.confirm") });
    expect(String(wipe.props["className"])).toMatch(/border-warn/u);
  });

  it("keeps focus through Wipe's and Delete's first confirm: onto Cancel and back to the opener (bug class 5)", async () => {
    await renderScreen(<SettingsScreen />, await createTestRuntime({ world: "empty" }));
    await fireEvent.press(screen.getByRole("button", { name: en("settings.deleteAccount") }));
    const [toCancel, said] = mockMoveFocus.mock.calls[0] ?? [];
    const toCancelControl = screen.getByRole("button", { name: en("common.cancel") });
    expect(isControl(toCancel, toCancelControl)).toBe(true);
    expect(said).toBe(en("settings.deleteAccount.warning"));
    expect(screen.getByText(en("settings.deleteAccount.warning")).props).toMatchObject({
      role: "status",
    });
    await fireEvent.press(screen.getByRole("button", { name: en("common.cancel") }));
    const [back] = mockMoveFocus.mock.calls[1] ?? [];
    const backControl = screen.getByRole("button", { name: en("settings.deleteAccount") });
    expect(isControl(back, backControl)).toBe(true);

    await fireEvent.press(screen.getByRole("button", { name: en("settings.wipe") }));
    await fireEvent.press(screen.getByRole("button", { name: en("common.cancel") }));
    const [wipeBack] = mockMoveFocus.mock.calls[3] ?? [];
    const wipeBackControl = screen.getByRole("button", { name: en("settings.wipe") });
    expect(isControl(wipeBack, wipeBackControl)).toBe(true);
  });

  it("follows the server, not this device's clock, past the request's expiry (bug class 35)", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174003";
    // This device's clock runs ahead: the request already looks over here.
    const statuses = ["pending", "confirmed"];
    await renderScreen(
      <SettingsScreen />,
      await createTestRuntime({
        routes: {
          "POST /api/account/confirmations": () => ({
            id,
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          }),
          [`GET /api/account/confirmations/${id}`]: () => ({
            status: statuses.shift() ?? "confirmed",
          }),
        },
        world: "empty",
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: en("settings.deleteAccount") }));
    await fireEvent.press(
      screen.getByRole("button", { name: en("settings.deleteAccount.confirm") }),
    );
    await waitFor(
      () => {
        expect(router.replace).toHaveBeenCalledWith("/login");
      },
      { timeout: 7000 },
    );
    expect(screen.queryByText(en("settings.confirmation.expired"))).toBeNull();
  }, 15_000);

  it("restores a pending Telegram confirmation after Settings remounts", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174001";
    const runtime = await createTestRuntime({
      routes: {
        "POST /api/account/confirmations": () => ({
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          id,
        }),
        [`GET /api/account/confirmations/${id}`]: () => ({ status: "pending" }),
      },
      world: "empty",
    });
    const first = await renderScreen(<SettingsScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("settings.wipe") }));
    await fireEvent.press(screen.getByRole("button", { name: en("settings.wipe.confirm") }));
    expect(screen.getByText(en("settings.confirmation.waiting"))).toBeOnTheScreen();
    expect(mockPendingConfirmation.current?.action).toBe("wipe");
    await first.unmount();
    await renderScreen(<SettingsScreen />, runtime);
    expect(screen.getByText(en("settings.confirmation.waiting"))).toBeOnTheScreen();
  });

  it("keeps waiting when Telegram confirmation was claimed before a local cancel", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174002";
    const runtime = await createTestRuntime({
      routes: {
        "POST /api/account/confirmations": () => ({
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          id,
        }),
        [`POST /api/account/confirmations/${id}/cancel`]: () => ({ status: "pending" }),
        [`GET /api/account/confirmations/${id}`]: () => ({ status: "pending" }),
      },
      world: "empty",
    });
    await renderScreen(<SettingsScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("settings.wipe") }));
    await fireEvent.press(screen.getByRole("button", { name: en("settings.wipe.confirm") }));
    await fireEvent.press(screen.getByRole("button", { name: en("common.cancel") }));
    expect(screen.getByText(en("settings.confirmation.waiting"))).toBeOnTheScreen();
    expect(mockPendingConfirmation.current?.request.id).toBe(id);
  });
});
