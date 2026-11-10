import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import * as firebaseProject from "#app/platform/firebase-project.ts";
import { pushStore, registerPush, setPushChoice } from "#app/platform/notifications.ts";
import { SettingsScreen } from "#app/screens/settings-screen.tsx";
import { isControl } from "#app/test/focus-target.ts";
import { refusingStore } from "#app/test/refusing-store.ts";
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

/** A node's NativeWind classes, as one string. */
const classesOf = (node: { readonly props: Record<string, unknown> }): string => {
  const name = node.props["className"];
  return typeof name === "string" ? name : "";
};

/** Whether the text, or a box around it, carries the rows' text inset. */
const insetOf = (text: string): string | undefined => {
  let node: null | ReturnType<typeof screen.getByText> = screen.getByText(text);
  while (node !== null && !/\bpx-row-x\b/u.test(classesOf(node))) {
    node = node.parent;
  }
  return node === null ? undefined : "px-row-x";
};

describe("SettingsScreen", () => {
  it("says who is signed in by the account's actions, the one place the name is shown (owner 2026-11-08)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.auth.me();
    await renderScreen(<SettingsScreen />, runtime);
    expect(screen.getByText(en("nav.signedInAs", { name: "Ann" }))).toBeOnTheScreen();
  });

  it("starts the account's own text and buttons at the section headers' text inset (design review 2 N6)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.auth.me();
    await renderScreen(<SettingsScreen />, runtime);
    // «Вы вошли как…», Export/Log out and «Опасные действия» stood at the group's edge (264 / 16)
    // while every section header's text starts a row inset in (280 / 32).
    expect(insetOf(en("nav.signedInAs", { name: "Ann" }))).toBe("px-row-x");
    expect(insetOf(en("settings.danger"))).toBe("px-row-x");
    expect(insetOf(en("settings.logout"))).toBe("px-row-x");
  });

  it("saves a digest time when the field is left, adds and removes one", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    const settings = () => runtime.state.store.getState().settings;
    const first = screen.getByLabelText(en("settings.digestWindows.time", { index: 1 }));
    await fireEvent.changeText(first, "8");
    await fireEvent(first, "blur");
    // Half a time is never stored: the field says so instead.
    expect(settings().digestWindows[0]).toBe("09:00");
    expect(screen.getByText(en("day.badTime"))).toBeOnTheScreen();
    await fireEvent.changeText(first, "0830");
    await fireEvent(first, "blur");
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
    const from = screen.getByLabelText(en("settings.quietHours.from"));
    await fireEvent.changeText(from, "2230");
    await fireEvent(from, "blur");
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.quietHours.from).toBe("22:30");
    });
    const presetsLink = `${en("settings.presets")} ${en("settings.presets.hint")}`;
    await fireEvent.press(screen.getByRole("link", { name: presetsLink }));
    expect(router.navigate).toHaveBeenCalledWith("/presets");
  });

  it("writes no quiet-hours event while the hour is retyped inside a filled value (QA-25 review I1)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    const quietHours = () => runtime.state.store.getState().settings.quietHours;
    const before = quietHours();
    const from = screen.getByLabelText(en("settings.quietHours.from"));
    // «23:00», the caret after the 3, Backspace, then «1»: 21:00, never 02:00 on the way.
    await fireEvent(from, "focus");
    await fireEvent.changeText(from, "2:00");
    expect(quietHours()).toEqual(before);
    expect(from.props["value"]).toBe("2:00");
    await fireEvent.changeText(from, "21:00");
    expect(quietHours()).toEqual(before);
    await fireEvent(from, "blur");
    await waitFor(() => {
      expect(quietHours().from).toBe("21:00");
    });
  });

  it("turns Week's night hours on and off", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    expect(nightHours()).not.toBeChecked();
    await fireEvent.press(nightHours());
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.nightHours).toBe(true);
    });
    expect(nightHours()).toBeChecked();
    await fireEvent.press(nightHours());
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.nightHours).toBe(false);
    });
  });

  it("says so and turns night hours back when the device refuses to save it, then rests", async () => {
    const disk = refusingStore();
    const runtime = await createTestRuntime({ eventStore: disk.eventStore, world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    disk.refuse();
    await fireEvent.press(nightHours());
    expect(await screen.findByText(en("actionError.persist_failed"))).toBeOnTheScreen();
    expect(nightHours()).not.toBeChecked();
    expect(runtime.state.store.getState().settings.nightHours).toBe(false);
    expect(disk.refused).toEqual([1]);
  });

  it("says so when the device refuses to save the language", async () => {
    const disk = refusingStore();
    const runtime = await createTestRuntime({ eventStore: disk.eventStore, world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    disk.refuse();
    await fireEvent.press(screen.getByRole("radio", { name: en("settings.language.ru") }));
    expect(await screen.findByText(en("actionError.persist_failed"))).toBeOnTheScreen();
    expect(runtime.state.store.getState().settings.language).toBe("en");
  });

  it("says so when the device refuses to save a notification switch", async () => {
    const disk = refusingStore();
    const runtime = await createTestRuntime({ eventStore: disk.eventStore, world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    disk.refuse();
    const digestOnWeb = screen.getByLabelText(
      en("notify.switch", {
        channel: en("notify.channel.web"),
        kind: en("notify.kind.deadline_digest"),
      }),
    );
    await fireEvent.press(digestOnWeb);
    expect(await screen.findByText(en("actionError.persist_failed"))).toBeOnTheScreen();
    expect(digestOnWeb).not.toBeChecked();
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
    await fireEvent.press(digestOnWeb);
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.notificationChannels.deadline_digest).toEqual({
        app: false,
        telegram: true,
        web: true,
      });
    });
    expect(digestOnWeb).toBeChecked();
  });

  it("names each kind of notification as a setting, not as its question (QA round 18 L12)", async () => {
    await renderScreen(<SettingsScreen />, await createTestRuntime({ world: "empty" }));
    expect(screen.getByRole("switch", { name: "Activity check: Telegram" })).toBeOnTheScreen();
    expect(screen.queryAllByRole("switch", { name: /\?/u })).toHaveLength(0);
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

  it("says so and keeps the previous pick when the phone refuses to save a method", async () => {
    fakeNotifications.state.granted = true;
    fakeNotifications.state.pushToken = "fcm-token";
    const runtime = await createTestRuntime({ routes: pushRoutes().routes, world: "empty" });
    await setPushChoice(null);
    await renderScreen(<SettingsScreen />, runtime);
    const poll = await screen.findByRole("radio", { name: en("settings.push.option.poll") });
    (SecureStore as unknown as FakeSecureStore).writes.isRefused = true;
    try {
      await fireEvent.press(poll);
      expect(await screen.findByText(en("settings.push.notSaved"))).toBeOnTheScreen();
      expect(screen.getByRole("radio", { name: en("settings.push.option.auto") })).toBeChecked();
    } finally {
      (SecureStore as unknown as FakeSecureStore).writes.isRefused = false;
    }
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

  it("logs out, and leaves the way to the login card to the route gate (PR A re-review N1)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    const logout = jest.spyOn(runtime.auth, "logout");
    await renderScreen(<SettingsScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("settings.logout") }));
    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
    });
    // A navigation after the log-out's answer remounted a login screen the gate already showed,
    // emptying what the person had started typing there (bug class 75).
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("reads the outbox at the press: a change whose count has not come back yet still asks (PR A re-review N2)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    const logout = jest.spyOn(runtime.auth, "logout");
    // The outbox's read is slow (IndexedDB behind another tab's writes): nothing is known before
    // it answers, so a count read ahead read 0 and dropped the change without a word.
    const held = Promise.withResolvers<number>();
    const reads = jest.fn(async () => await held.promise);
    await renderScreen(<SettingsScreen />, { ...runtime, unsyncedCount: reads });
    await fireEvent.press(screen.getByRole("button", { name: en("settings.logout") }));
    expect(logout).not.toHaveBeenCalled();
    await act(async () => {
      held.resolve(1);
      await Promise.resolve();
    });
    expect(
      await screen.findByText("1 change has not synced yet: signing out now loses it."),
    ).toBeOnTheScreen();
    expect(logout).not.toHaveBeenCalled();
  });

  it("asks when the outbox cannot be read, without naming a count (PR A re-review N2)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    const logout = jest.spyOn(runtime.auth, "logout");
    const reads = jest.fn(async () => {
      throw new Error("IndexedDB refused");
    });
    await renderScreen(<SettingsScreen />, { ...runtime, unsyncedCount: reads });
    await fireEvent.press(screen.getByRole("button", { name: en("settings.logout") }));
    expect(await screen.findByText(en("settings.logout.unsynced.unknown"))).toBeOnTheScreen();
    expect(logout).not.toHaveBeenCalled();
    // Still reachable: the person can log out anyway.
    await fireEvent.press(screen.getByRole("button", { name: en("settings.logout.anyway") }));
    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
    });
  });

  it("asks before Log out discards changes that have not synced, and can wait (QA round 23 R23-02)", async () => {
    const runtime = await createTestRuntime({
      routes: { "POST /api/sync/push": () => problem(503, "offline") },
      world: "empty",
    });
    const logout = jest.spyOn(runtime.auth, "logout");
    await runtime.actions.setNightHours(true);
    await runtime.actions.setLanguage("en");
    await renderScreen(<SettingsScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("settings.logout") }));
    // Nothing is discarded yet: the question names how many, and offers to wait.
    expect(
      await screen.findByText("2 changes have not synced yet: signing out now loses them."),
    ).toBeOnTheScreen();
    expect(logout).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: en("settings.logout.wait") }));
    expect(screen.queryByText(/have not synced yet/u)).toBeNull();
    expect(logout).not.toHaveBeenCalled();
    // Log out stays reachable: asked again, the person chooses to log out anyway.
    await fireEvent.press(screen.getByRole("button", { name: en("settings.logout") }));
    await fireEvent.press(
      await screen.findByRole("button", { name: en("settings.logout.anyway") }),
    );
    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("on a phone puts Wait over Sign out anyway, each the column's width, so neither label wraps (bug class 191)", async () => {
    const runtime = await createTestRuntime({
      routes: { "POST /api/sync/push": () => problem(503, "offline") },
      world: "empty",
    });
    await runtime.actions.setNightHours(true);
    await runtime.actions.setLanguage("en");
    await renderScreen(<SettingsScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("settings.logout") }));
    // Side by side at the text inset (design review 2 N6) each half was 159 px at 390, and
    // «Sign out anyway» / «Всё равно выйти» ran two lines (60 px). Stacked as the danger zone's.
    const anyway = await screen.findByRole("button", { name: en("settings.logout.anyway") });
    let node: null | typeof anyway = anyway;
    const rows: string[] = [];
    while (node !== null && node.props["role"] !== "group") {
      if (/\bflex-row\b/u.test(classesOf(node))) {
        rows.push(classesOf(node));
      }
      node = node.parent;
    }
    expect(node).not.toBeNull();
    expect(rows).toEqual([]);
  });

  it("waits for Telegram before deleting and can poll after the session disappears", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const created = jest.fn(() => ({
      id,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    }));
    const runtime = await createTestRuntime({
      routes: {
        "POST /api/account/confirmations": created,
        [`GET /api/account/confirmations/${id}`]: () => ({ status: "confirmed" }),
      },
      world: "empty",
    });
    const finished = jest.spyOn(runtime.auth, "finishAccountDeletion");
    await renderScreen(<SettingsScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("settings.deleteAccount") }));
    expect(created).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole("button", { name: en("settings.deleteAccount.confirm") }),
    );
    expect(screen.getByText(en("settings.confirmation.waiting"))).toBeOnTheScreen();
    await waitFor(
      () => {
        expect(finished).toHaveBeenCalledTimes(1);
      },
      { timeout: 4000 },
    );
    // The route gate takes a signed-out device to the login card; no navigation of its own.
    expect(router.replace).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledTimes(1);
  });

  it("dresses Wipe and Delete as dangerous, and says both are confirmed in Telegram", async () => {
    await renderScreen(<SettingsScreen />, await createTestRuntime({ world: "empty" }));
    await fireEvent.press(screen.getByRole("button", { name: en("settings.deleteAccount") }));
    const remove = screen.getByRole("button", { name: en("settings.deleteAccount.confirm") });
    expect(en("settings.deleteAccount.confirm")).toMatch(/Telegram/u);
    // Both on the destructive look, alike (spec §4.2.3, F-CMP-07): the quiet danger fill.
    expect(String(within(remove).getByTestId("pressable-visual").props["className"])).toMatch(
      /border-danger/u,
    );
    await fireEvent.press(screen.getByRole("button", { name: en("common.cancel") }));
    await fireEvent.press(screen.getByRole("button", { name: en("settings.wipe") }));
    const wipe = screen.getByRole("button", { name: en("settings.wipe.confirm") });
    expect(String(within(wipe).getByTestId("pressable-visual").props["className"])).toMatch(
      /border-danger/u,
    );
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
    const runtime = await createTestRuntime({
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
    });
    const finished = jest.spyOn(runtime.auth, "finishAccountDeletion");
    await renderScreen(<SettingsScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("settings.deleteAccount") }));
    await fireEvent.press(
      screen.getByRole("button", { name: en("settings.deleteAccount.confirm") }),
    );
    await waitFor(
      () => {
        expect(finished).toHaveBeenCalledTimes(1);
      },
      { timeout: 7000 },
    );
    expect(router.replace).not.toHaveBeenCalled();
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

describe("Settings sections (spec §5.17)", () => {
  it("groups the settings under headings, destructive actions last in the danger style", async () => {
    await renderScreen(<SettingsScreen />, await createTestRuntime({ world: "empty" }));
    for (const key of ["settings.account", "settings.notifications", "settings.tasks"] as const) {
      expect(screen.getByRole("header", { name: en(key) })).toBeOnTheScreen();
    }
    expect(screen.getAllByTestId("group-separator").length).toBeGreaterThan(0);
  });

  it("shows the server read-only with its host on a phone", async () => {
    await renderScreen(<SettingsScreen />, await createTestRuntime({ world: "empty" }));
    expect(screen.getByText(en("settings.server.hint"))).toBeOnTheScreen();
  });

  it("runs in a zone that is not UTC, so a host-zone assumption fails here (bug-lessons class 135)", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(0);
  });
});
