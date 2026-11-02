import { act, screen } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type * as NotificationsFake from "#app/testing/notifications.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { PaceProvider } from "#app/app-state.tsx";
import { GateProvider, NavigatorHold, RouteGate } from "#app/auth/route-gate.tsx";
import { markOnboarded } from "#app/platform/onboarding.ts";
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

/** The root layout's order: the hold, then the Stack, whose layout follows the link past the gate. */
const Layout = () => (
  <GateProvider>
    <NavigatorHold>
      <Stack
        layout={({ children }) => (
          <RouteGate path="/">
            <NotificationLinks />
            {children}
          </RouteGate>
        )}
        screenOptions={{ headerShown: false }}
      />
    </NavigatorHold>
  </GateProvider>
);

describe("a notification tapped on a cold start (QA round 17 review I3)", () => {
  afterEach(() => {
    fake.state.lastResponse = null;
    storage.readGate = null;
    jest.useRealTimers();
  });

  it("opens the task it points at, and Back goes to Now", async () => {
    await markOnboarded();
    const runtime = await createTestRuntime({
      routes: { "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }) },
    });
    await runtime.auth.loginWithDev("1");
    expect(runtime.auth.store.getState().status).toBe("signed-in");
    fake.state.lastResponse = {
      actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
      notification: { request: { content: { data: { url: "/task/abc" } } } },
    };
    // A cold start: the walk-through mark is still being read, so the hold shows a blank page.
    const read = Promise.withResolvers<null>();
    storage.readGate = read.promise;
    const routed = renderRouter(
      {
        _layout: Layout,
        index: () => <Text>Now</Text>,
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
