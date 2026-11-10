import type { ReactNode } from "react";

import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { router, Stack, usePathname } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { PaceRuntime } from "#app/runtime.ts";

import { PaceProvider } from "#app/app-state.tsx";
import { en } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { withWindowWidth } from "#app/test/window.ts";

import MoreLayout, * as moreLayout from "../../app/(tabs)/(more)/_layout.tsx";
import MoreRoute from "../../app/(tabs)/(more)/more.tsx";
import TabsLayout from "../../app/(tabs)/_layout.tsx";
import { anchoredAtMore } from "./more-stack.tsx";
import { ThemeProvider } from "./theme-provider.tsx";
import { ToastProvider } from "./toast.tsx";

jest.unmock("expo-router");

const METRICS = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
};

/** A stand-in screen that says where it is. */
const Here = () => <Text>{`at ${usePathname()}`}</Text>;

/**
The app's own tab and More layouts, with stand-in screens: the root Stack holds the tabs and the
task page (opened over them from several tabs).
*/
const renderApp = (runtime: PaceRuntime, initialUrl: string, more: () => ReactNode = Here) =>
  renderRouter(
    {
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      "(tabs)/_layout": TabsLayout,
      "(tabs)/index": Here,
      "(tabs)/day": Here,
      "(tabs)/inbox": Here,
      "(tabs)/add": Here,
      "(tabs)/(more)/_layout": { ...moreLayout, default: MoreLayout },
      "(tabs)/(more)/more": more as () => null,
      "(tabs)/(more)/week": Here,
      "(tabs)/(more)/projects": Here,
      "(tabs)/(more)/project/[id]": Here,
      "(tabs)/(more)/insights": Here,
      "(tabs)/(more)/history": Here,
      "(tabs)/(more)/settings": Here,
      "(tabs)/(more)/notifications": Here,
      "(tabs)/(more)/presets/index": Here,
      "(tabs)/(more)/presets/[id]": Here,
      "(tabs)/(more)/decisions": Here,
      "task/[id]": Here,
    },
    {
      initialUrl,
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <PaceProvider runtime={runtime}>
              <ToastProvider>{children}</ToastProvider>
            </PaceProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      ),
    },
  );

/** Lets the router's queued work and the anchor's reset land. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 3; turn += 1) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20);
    });
  }
};

/** The tab bar's selected tab, by its name; throws if there is no bar. */
const selectedTab = (): string =>
  within(screen.getByTestId("tab-bar")).getByRole("tab", { selected: true }).props[
    "accessibilityLabel"
  ] as string;

afterEach(() => {
  jest.useRealTimers();
});

const DESTINATIONS = [
  "/week",
  "/projects",
  "/project/p1",
  "/insights",
  "/history",
  "/settings",
  "/notifications",
  "/presets",
  "/presets/hw",
  "/decisions",
] as const;

describe("More's destinations on a phone (spec §4.2.27, F-AND-03)", () => {
  it.each(DESTINATIONS)(
    "%s keeps the tab bar, More selected, and Back leads to More",
    async (url) => {
      await renderApp(await createTestRuntime(), url);
      await settle();
      expect(screen.getByText(`at ${url}`)).toBeOnTheScreen();
      expect(selectedTab()).toBe(en("nav.more"));
      await act(() => {
        router.back();
      });
      await settle();
      expect(screen.getByText("at /more")).toBeOnTheScreen();
      expect(selectedTab()).toBe(en("nav.more"));
    },
  );

  it("keeps the search params a destination's state rides on", async () => {
    await renderApp(await createTestRuntime(), "/presets/new?from=hw");
    await settle();
    expect(screen.getByText("at /presets/new")).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(true);
  });

  it("opened from another tab (Now's bell), Back leads to More, and More then shows More", async () => {
    await renderApp(await createTestRuntime(), "/");
    await settle();
    await act(() => {
      router.push("/notifications");
    });
    await settle();
    expect(screen.getByText("at /notifications")).toBeOnTheScreen();
    expect(selectedTab()).toBe(en("nav.more"));
    await act(() => {
      router.back();
    });
    await settle();
    expect(screen.getByText("at /more")).toBeOnTheScreen();
  });

  it("goes back to More's own list when More is pressed on a destination", async () => {
    await renderApp(await createTestRuntime(), "/more");
    await settle();
    await act(() => {
      router.push("/week");
    });
    await settle();
    await fireEvent.press(
      within(screen.getByTestId("tab-bar")).getByRole("tab", { name: en("nav.more") }),
    );
    await settle();
    expect(screen.getByText("at /more")).toBeOnTheScreen();
  });

  it("covers the tabs with the task page, which goes back to the destination it came from", async () => {
    await renderApp(await createTestRuntime(), "/week");
    await settle();
    await act(() => {
      router.push("/task/t1");
    });
    await settle();
    expect(screen.getByText("at /task/t1")).toBeOnTheScreen();
    await act(() => {
      router.back();
    });
    await settle();
    expect(screen.getByText("at /week")).toBeOnTheScreen();
    expect(selectedTab()).toBe(en("nav.more"));
  });
});

describe("More's destinations beside the sidebar", () => {
  withWindowWidth(1440);

  it("show no tab bar and stay where they are (More under them sends nowhere while unseen)", async () => {
    await renderApp(await createTestRuntime(), "/week", MoreRoute);
    await settle();
    expect(screen.getByText("at /week")).toBeOnTheScreen();
    expect(screen.queryByTestId("tab-bar")).toBeNull();
  });

  it("stay where the sidebar opened them from Now", async () => {
    await renderApp(await createTestRuntime(), "/", MoreRoute);
    await settle();
    await act(() => {
      router.navigate("/week");
    });
    await settle();
    expect(screen.getByText("at /week")).toBeOnTheScreen();
  });
});

describe("anchoredAtMore", () => {
  it("puts More under a destination opened on its own", () => {
    expect(anchoredAtMore({ index: 0, routes: [{ key: "week-1", name: "week" }] })).toMatchObject({
      index: 1,
      routes: [{ name: "more" }, { key: "week-1", name: "week" }],
    });
  });

  it("leaves a stack that starts at More alone", () => {
    expect(
      anchoredAtMore({
        index: 1,
        routes: [
          { key: "more-1", name: "more" },
          { key: "week-1", name: "week" },
        ],
      }),
    ).toBeNull();
  });

  it("leaves an empty stack alone: nothing in front to put More under (session review minor 10)", () => {
    expect(anchoredAtMore({ index: 0, routes: [] })).toBeNull();
  });
});
