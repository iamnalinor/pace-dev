import { act, screen } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { memo, type ReactNode } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { PaceRuntime } from "#app/runtime.ts";

import { PaceProvider } from "#app/app-state.tsx";
import { useSearchParam } from "#app/shared/use-search-param.ts";
import { createTestRuntime } from "#app/test/runtime.ts";

import TabsLayout from "../../app/(tabs)/_layout.tsx";
import { sceneLayout } from "./screen-scene.tsx";
import { ThemeProvider } from "./theme-provider.tsx";
import { ToastProvider } from "./toast.tsx";

jest.unmock("expo-router");

const METRICS = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
};

const renders: Record<string, number> = {};

/**
A stand-in screen as the app's are: memoized, reading a search param of its address. It counts its
renders: its whole tree hangs under it, so one render of it is a render of the screen.
*/
const counted = (name: string) => {
  const Screen = memo(function Screen() {
    const [value] = useSearchParam("task");
    renders[name] = (renders[name] ?? 0) + 1;
    return <Text>{`screen ${name} ${value ?? "none"}`}</Text>;
  });
  // The route file's own component: it only draws the screen (`app/(tabs)/day.tsx`).
  return function Route() {
    return <Screen />;
  };
};

const renderApp = (runtime: PaceRuntime) =>
  renderRouter(
    {
      _layout: () => <Stack screenLayout={sceneLayout} screenOptions={{ headerShown: false }} />,
      "(tabs)/_layout": TabsLayout,
      "(tabs)/index": counted("now"),
      "(tabs)/day": counted("day"),
      "(tabs)/inbox": counted("inbox"),
      "(tabs)/add": counted("add"),
      "(tabs)/(more)/_layout": () => <Stack screenOptions={{ headerShown: false }} />,
      "(tabs)/(more)/more": counted("more"),
      "task/[id]": counted("task"),
    },
    {
      initialUrl: "/",
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

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 3; turn += 1) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20);
    });
  }
};

/** Goes somewhere and answers which screens were rendered for it, and how often. */
const rendersOf = async (go: () => void): Promise<Readonly<Record<string, number>>> => {
  for (const key of Object.keys(renders)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- a count per navigation
    delete renders[key];
  }
  await act(go);
  await settle();
  return { ...renders };
};

afterEach(() => {
  jest.useRealTimers();
});

describe("a navigation renders no screen whose content did not change (bug-lessons 310)", () => {
  it("renders neither the tab left nor the tab entered again, nor the tabs under a pushed task", async () => {
    jest.useFakeTimers();
    await renderApp(await createTestRuntime());
    await settle();
    // Every tab mounts on its first visit.
    await rendersOf(() => {
      router.navigate("/day");
    });
    await rendersOf(() => {
      router.navigate("/inbox");
    });
    expect(
      await rendersOf(() => {
        router.navigate("/");
      }),
    ).toEqual({});
    expect(
      await rendersOf(() => {
        router.navigate("/day");
      }),
    ).toEqual({});
    expect(
      await rendersOf(() => {
        router.push("/task/t1");
      }),
    ).toEqual({ task: 1 });
    expect(
      await rendersOf(() => {
        router.back();
      }),
    ).toEqual({});
    expect(screen.getByText("screen day none")).toBeOnTheScreen();
  });

  it("renders the screen whose own search param changed, once", async () => {
    jest.useFakeTimers();
    await renderApp(await createTestRuntime());
    await settle();
    expect(
      await rendersOf(() => {
        router.setParams({ task: "t9" });
      }),
    ).toEqual({ now: 1 });
    expect(screen.getByText("screen now t9")).toBeOnTheScreen();
  });
});
