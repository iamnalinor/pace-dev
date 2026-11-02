import { act, screen } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { router, Stack, usePathname } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { type ReactNode, useEffect } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { PaceRuntime } from "#app/runtime.ts";
import type * as NotificationsFake from "#app/testing/notifications.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { PaceProvider } from "#app/app-state.tsx";
import { GateProvider, NavigatorHold, RouteGate } from "#app/auth/route-gate.tsx";
import { IncompatibleGate } from "#app/features/server/incompatible-screen.tsx";
import { markOnboarded } from "#app/platform/onboarding.ts";
import { serverStore } from "#app/platform/server-store.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { ThemeProvider } from "#app/ui/theme-provider.tsx";
import { fakeUser } from "@pace/client/testing";

import { NotificationLinks } from "./notification-links.ts";

jest.unmock("expo-router");

const fake = Notifications as unknown as ReturnType<
  typeof NotificationsFake.createFakeNotifications
>;
const storage = SecureStore as unknown as FakeSecureStore;

const METRICS = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
};

/**
`paths`: every path the app stood on, in order (a loop shows as paths that keep alternating).
`mounts`: how often the link follower mounted. Past a bound it is no longer mounted, so a
regression that follows the same tap on every remount ends as a failed count, not an endless test.
*/
const seen = { mounts: 0, paths: [] as string[] };
const MOUNT_BOUND = 12;

const CountedLinks = () => {
  useEffect(() => {
    seen.mounts += 1;
  }, []);
  return <NotificationLinks />;
};

/** The root layout's gates in its order: the versions screen, then the route gate on the path. */
const Gates = ({ children }: { readonly children: ReactNode }) => {
  const path = usePathname();
  useEffect(() => {
    seen.paths.push(path);
  }, [path]);
  return (
    <IncompatibleGate>
      <RouteGate path={path}>
        {/* Under the hold and the gate: a tap is followed once the Stack exists. */}
        {seen.mounts < MOUNT_BOUND ? <CountedLinks /> : null}
        {children}
      </RouteGate>
    </IncompatibleGate>
  );
};

/** The root layout's order: the hold, then the Stack, whose layout follows the link past the gate. */
const Layout = () => (
  <GateProvider>
    <NavigatorHold>
      <Stack
        layout={({ children }) => <Gates>{children}</Gates>}
        screenOptions={{ headerShown: false }}
      />
    </NavigatorHold>
  </GateProvider>
);

/** A tap on a notification that points at task `abc` (its identifier is the notification's). */
const tapOn = (identifier: string) => ({
  actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
  notification: { request: { content: { data: { url: "/task/abc" } }, identifier } },
});

const DEV_LOGIN = { "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }) };

const signedInRuntime = async (): Promise<PaceRuntime> => {
  await markOnboarded();
  const runtime = await createTestRuntime({ routes: DEV_LOGIN });
  await runtime.auth.loginWithDev("1");
  expect(runtime.auth.store.getState().status).toBe("signed-in");
  return runtime;
};

const renderApp = (runtime: PaceRuntime) =>
  renderRouter(
    {
      _layout: Layout,
      index: () => <Text>Now</Text>,
      login: () => <Text>Sign in</Text>,
      onboarding: () => <Text>Walk-through</Text>,
      "task/[id]": () => <Text>The task</Text>,
    },
    {
      initialUrl: "/",
      wrapper: ({ children }) => (
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <PaceProvider runtime={runtime}>{children}</PaceProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      ),
    },
  );

/**
Lets a few timer turns pass (`renderRouter` turns jest's fake timers on), so a redirect loop has
its chance to show.
*/
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20);
    });
  }
};

/** The paths the app stood on since `from` (an index into `paths`). */
const pathsSince = (from: number): readonly string[] => seen.paths.slice(from);

beforeEach(() => {
  seen.paths.length = 0;
  seen.mounts = 0;
  // A fresh phone: no walk-through mark from an earlier test.
  storage.values.clear();
});

afterEach(() => {
  fake.state.lastResponse = null;
  storage.readGate = null;
  serverStore.setState({ reason: null, status: "unknown" });
  jest.useRealTimers();
});

describe("a notification tapped on a cold start (QA round 17 review I3)", () => {
  it("opens the task it points at, and Back goes to Now", async () => {
    const runtime = await signedInRuntime();
    fake.state.lastResponse = tapOn("cold-start");
    // A cold start: the walk-through mark is still being read, so the hold shows a blank page.
    const read = Promise.withResolvers<null>();
    storage.readGate = read.promise;
    const routed = renderApp(runtime);
    // RNTL 14 renders asynchronously: the router's helpers ride on the pending render.
    await routed;
    expect(screen.queryByText("Now")).toBeNull();
    await act(async () => {
      read.resolve(null);
      await read.promise;
    });
    expect(await screen.findByText("The task")).toBeOnTheScreen();
    expect(routed.getPathname()).toBe("/task/abc");
    expect(router.canGoBack()).toBe(true);
    await act(() => {
      router.back();
    });
    expect(routed.getPathname()).toBe("/");
    expect(await screen.findByText("Now")).toBeOnTheScreen();
  });
});

describe("a tap is followed once across remounts (QA round 17 round-3 review C1)", () => {
  it("logging out after following a tap lands on the login screen and stays there", async () => {
    const runtime = await signedInRuntime();
    fake.state.lastResponse = tapOn("after-logout");
    const routed = renderApp(runtime);
    await routed;
    expect(await screen.findByText("The task")).toBeOnTheScreen();
    // The phone forgets a tap once it was followed, so no later mount reads it again.
    expect(fake.state.lastResponse).toBeNull();

    await act(async () => {
      await runtime.auth.logout();
    });
    await settle();
    const settled = seen.paths.length;
    await settle();

    expect(routed.getPathname()).toBe("/login");
    expect(await screen.findByText("Sign in")).toBeOnTheScreen();
    expect(pathsSince(settled)).toEqual([]);
    expect(seen.paths.filter((path) => path === "/task/abc")).toHaveLength(1);
    expect(seen.mounts).toBeLessThan(MOUNT_BOUND);
  });

  it("a cold start signed out with a pending tap stays on the login screen; the tap is dropped", async () => {
    const runtime = await createTestRuntime({ routes: DEV_LOGIN });
    fake.state.lastResponse = tapOn("signed-out");
    const routed = renderApp(runtime);
    await routed;
    await settle();

    expect(routed.getPathname()).toBe("/login");
    expect(await screen.findByText("Sign in")).toBeOnTheScreen();
    expect(seen.paths).not.toContain("/task/abc");
    expect(seen.mounts).toBeLessThan(MOUNT_BOUND);
    expect(fake.state.lastResponse).toBeNull();

    // Not kept for after signing in: the tap may have been meant for another account.
    await act(async () => {
      await markOnboarded();
      await runtime.auth.loginWithDev("1");
    });
    await act(() => {
      router.replace("/");
    });
    await settle();
    expect(routed.getPathname()).toBe("/");
    expect(seen.paths).not.toContain("/task/abc");
  });

  it("a tap on a phone before its walk-through waits there, then opens once it is done", async () => {
    const runtime = await createTestRuntime({ routes: DEV_LOGIN });
    await runtime.auth.loginWithDev("1");
    fake.state.lastResponse = tapOn("walk-through");
    const routed = renderApp(runtime);
    await routed;
    await settle();

    expect(routed.getPathname()).toBe("/onboarding");
    expect(await screen.findByText("Walk-through")).toBeOnTheScreen();
    expect(seen.paths).not.toContain("/task/abc");
    expect(seen.mounts).toBeLessThan(MOUNT_BOUND);

    await act(async () => {
      await markOnboarded();
    });
    await act(() => {
      router.replace("/");
    });
    expect(await screen.findByText("The task")).toBeOnTheScreen();
    expect(routed.getPathname()).toBe("/task/abc");
    expect(fake.state.lastResponse).toBeNull();
  });

  it("the versions screen giving way does not reopen a task already opened", async () => {
    const runtime = await signedInRuntime();
    fake.state.lastResponse = tapOn("versions");
    const routed = renderApp(runtime);
    await routed;
    expect(await screen.findByText("The task")).toBeOnTheScreen();
    await act(() => {
      router.back();
    });
    expect(await screen.findByText("Now")).toBeOnTheScreen();

    await act(() => {
      serverStore.setState({ reason: "client-outdated", status: "incompatible" });
    });
    expect(screen.queryByText("Now")).toBeNull();
    await act(() => {
      serverStore.setState({ reason: null, status: "ok" });
    });
    await settle();

    expect(routed.getPathname()).toBe("/");
    expect(await screen.findByText("Now")).toBeOnTheScreen();
    expect(seen.paths.filter((path) => path === "/task/abc")).toHaveLength(1);
  });
});
