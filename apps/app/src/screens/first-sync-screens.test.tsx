import type { ReactElement } from "react";

import { act, screen } from "@testing-library/react-native";

import { DayScreen } from "#app/features/day/day-screen.tsx";
import { InsightsScreen } from "#app/features/insights/insights-screen.tsx";
import { NotificationsScreen } from "#app/features/notifications/notifications-screen.tsx";
import { WeekScreen } from "#app/features/week/week-screen.tsx";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { fakeUser } from "@pace/client/testing";

import { DecisionsScreen } from "./decisions-screen.tsx";
import { HistoryScreen } from "./history-screen.tsx";
import { InboxScreen } from "./inbox-screen.tsx";
import { NowScreen } from "./now-screen.tsx";
import { PresetsScreen } from "./presets-screen.tsx";
import { ProjectsScreen } from "./projects-screen.tsx";
import { SettingsScreen } from "./settings-screen.tsx";

/*
QA round 19 M1 (class 62): while the first sync of an empty copy runs, no screen says anything is
empty or zero: nothing is known yet. Every screen of the route list that shows the account's data,
rendered on an empty copy whose first pull is held.
*/

/** The final "nothing here" sentences the screens can print. */
const EMPTY_COPY = new Set([
  en("now.empty"),
  en("day.empty"),
  en("day.noApps"),
  en("decisions.empty"),
  en("inbox.empty"),
  en("review.empty"),
  en("projects.empty"),
  en("projects.open.none"),
  en("history.emptyAt"),
  en("insights.nothing"),
  en("notifications.empty"),
]);

/** A total of nothing ("0m", "0 min", "0h"), as a fact. */
const ZERO_TOTAL = /(?:^|[^\d.,:])0\s?(?:m|min|h)\b/u;

/** Every text the screen draws, in order. */
const textsOnScreen = (): readonly string[] => {
  const texts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      texts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child);
      }
      return;
    }
    if (typeof node === "object" && node !== null && "children" in node) {
      walk((node as { readonly children: unknown }).children);
    }
  };
  walk(screen.toJSON());
  return texts;
};

const SCREENS: readonly (readonly [string, () => ReactElement])[] = [
  ["Now", () => <NowScreen />],
  ["Day", () => <DayScreen />],
  ["Week", () => <WeekScreen />],
  ["Inbox", () => <InboxScreen />],
  ["Projects", () => <ProjectsScreen />],
  ["Insights", () => <InsightsScreen />],
  ["History", () => <HistoryScreen />],
  ["Assistant log", () => <DecisionsScreen />],
  ["Notifications", () => <NotificationsScreen />],
];

/** An empty copy, signed in, its first pull held: the first sync is running. */
const duringFirstSync = async (ui: ReactElement) => {
  const held = Promise.withResolvers<unknown>();
  const runtime = await createTestRuntime({
    routes: {
      // The server's own answers come at once; only the log waits.
      "GET /api/decisions": () => ({ decisions: [] }),
      "GET /api/sessions": () => ({ sessions: [] }),
      "GET /api/sync/pull": async () => await held.promise,
      "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
    },
    world: "empty",
  });
  await runtime.auth.loginWithDev("1");
  await renderScreen(ui, runtime);
  await act(async () => {
    await Promise.resolve();
  });
  return runtime;
};

describe("Settings and Presets during the first sync (QA round 20 M1)", () => {
  it("Settings shows no account value nor a control that writes one, Log out stays", async () => {
    await duringFirstSync(<SettingsScreen />);
    // The account's language, night hours, notifications, digest times: not known yet.
    for (const text of [
      en("settings.language.en"),
      en("settings.language.ru"),
      en("settings.nightHours"),
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    // Only the phone's own switch (whether it sends its calendar) is there.
    expect(
      screen
        .queryAllByRole("switch")
        .map((control) => control.props["accessibilityLabel"] as string),
    ).toEqual([en("devices.calendar")]);
    expect(
      screen.getAllByRole("progressbar", { name: en("sync.loadingData") }).length,
    ).toBeGreaterThan(0);
    // The device's own choices and the way out are there.
    expect(screen.getByText(en("settings.theme.dark"))).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: en("settings.logout") })).toBeOnTheScreen();
  });

  it.each([
    ["Settings", () => <SettingsScreen />, () => screen.queryByText(en("settings.language.en"))],
    ["Presets", () => <PresetsScreen />, () => screen.queryByText(en("presets.seedExamples"))],
    [
      "Week",
      () => <WeekScreen />,
      () => screen.queryByRole("switch", { name: en("week.nightHours") }),
    ],
  ] as const)(
    "%s keeps waiting after a failed first pull, until one succeeds for this session (round 7 review 12)",
    async (_name, ui, known) => {
      const server = { isDown: true };
      const runtime = await createTestRuntime({
        routes: {
          "GET /api/sessions": () => ({ sessions: [] }),
          "GET /api/sync/pull": () => {
            if (server.isDown) {
              throw new TypeError("Failed to fetch");
            }
            return { events: [], more: false, seq: 0, storeId: "store-test" };
          },
          "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
        },
        world: "empty",
      });
      await runtime.auth.loginWithDev("1");
      await renderScreen(ui(), runtime);
      await act(async () => {
        await runtime.sync.syncNow();
      });
      expect(runtime.sync.status.getState().online).toBe(false);
      // The first sync ended (failed): the defaults are still not the account's, nothing to change.
      expect(known()).toBeNull();
      server.isDown = false;
      await act(async () => {
        await runtime.sync.syncNow();
      });
      expect(known()).toBeOnTheScreen();
    },
  );

  it("Week draws no night-hours switch, the same account value as Settings' (round 6-D sweep)", async () => {
    await duringFirstSync(<WeekScreen />);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("Presets shows grey rows instead of the built-in list and its actions", async () => {
    await duringFirstSync(<PresetsScreen />);
    expect(screen.queryByText(en("presets.seedExamples"))).toBeNull();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(
      screen.getAllByRole("progressbar", { name: en("sync.loadingData") }).length,
    ).toBeGreaterThan(0);
  });
});

describe("a screen during the first sync (QA round 19 M1)", () => {
  it.each(SCREENS)("%s prints no empty sentence and no zero total", async (_name, ui) => {
    const held = Promise.withResolvers<unknown>();
    const runtime = await createTestRuntime({
      routes: {
        // The server's own answers come at once; only the log waits.
        "GET /api/decisions": () => ({ decisions: [] }),
        "GET /api/sync/pull": async () => await held.promise,
        "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
      },
      world: "empty",
    });
    await runtime.auth.loginWithDev("1");
    await renderScreen(ui(), runtime);
    await act(async () => {
      await Promise.resolve();
    });
    const texts = textsOnScreen();
    expect({
      empty: texts.filter((text) => EMPTY_COPY.has(text)),
      zeros: texts.filter((text) => ZERO_TOTAL.test(text)),
    }).toEqual({ empty: [], zeros: [] });
    // Something says it is loading instead of a blank page under the header.
    expect(
      screen.getAllByRole("progressbar", { name: en("sync.loadingData") }).length,
    ).toBeGreaterThan(0);
  });
});
