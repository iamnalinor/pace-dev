import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";

import { markOnboarded } from "#app/platform/onboarding.ts";
import { renderScreen } from "#app/test/render.tsx";
import { redirected } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";

import { GateProvider, isBarePath, NavigatorHold, RouteGate } from "./route-gate.tsx";

const renderAt = async (path: string, runtime: Awaited<ReturnType<typeof createTestRuntime>>) =>
  await renderScreen(
    <GateProvider>
      <RouteGate path={path}>
        <Text>the screen</Text>
      </RouteGate>
    </GateProvider>,
    runtime,
  );

/** The gate over a path that changes while it stays mounted, as the root layout's does. */
const Navigating = () => {
  const [path, setPath] = useState("/onboarding");
  return (
    <RouteGate path={path}>
      <Text>the screen</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setPath("/");
        }}
      >
        <Text>go to Now</Text>
      </Pressable>
    </RouteGate>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("RouteGate", () => {
  it.each(["/settings", "/projects", "/insights", "/history", "/week", "/task/abc"])(
    "sends a signed-out deep link to %s to the login screen, showing nothing of it",
    async (path) => {
      await renderAt(path, await createTestRuntime({ world: "empty" }));
      await waitFor(() => {
        expect(redirected).toHaveBeenCalledWith("/login");
      });
      expect(screen.queryByText("the screen")).toBeNull();
    },
  );

  it("lets the login screen and the walk-through show without a session", async () => {
    await renderAt("/login", await createTestRuntime({ world: "empty" }));
    expect(screen.getByText("the screen")).toBeOnTheScreen();
    expect(redirected).not.toHaveBeenCalled();
  });

  it("sends a signed-in phone that has not seen the walk-through to it first", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.auth.me();
    await renderAt("/settings", runtime);
    await waitFor(() => {
      expect(redirected).toHaveBeenCalledWith("/onboarding");
    });
    expect(screen.queryByText("the screen")).toBeNull();
  });

  // The phone is marked onboarded here and stays so for the rest of this file: keep it last of its kind.
  it("lets a phone out of the walk-through once it is done, without sending it back in", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.auth.me();
    await renderScreen(
      <GateProvider>
        <Navigating />
      </GateProvider>,
      runtime,
    );
    // Mounted on the walk-through, with "not yet" read from storage.
    await act(async () => {
      await Promise.resolve();
    });
    expect(redirected).not.toHaveBeenCalled();
    await act(async () => {
      await markOnboarded();
    });
    await fireEvent.press(screen.getByRole("button", { name: "go to Now" }));
    expect(screen.getByText("the screen")).toBeOnTheScreen();
    expect(redirected).not.toHaveBeenCalled();
  });

  it("shows a screen to a signed-in, onboarded person", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.auth.me();
    await markOnboarded();
    await renderAt("/settings", runtime);
    expect(await screen.findByText("the screen")).toBeOnTheScreen();
    expect(redirected).not.toHaveBeenCalled();
  });
});

/** Counts how often the navigator under the hold mounts. */
const mounts = jest.fn<undefined, []>();
const CountedNavigator = () => {
  useEffect(() => {
    mounts();
  }, []);
  return <Text>the navigator</Text>;
};

describe("NavigatorHold", () => {
  // QA round 17 M2: a navigator mounted behind the blank gate took its route from the address too
  // late, and Day reloaded as Now. It mounts once the gate is read, together with its screens.
  it("mounts the navigator only once the gate is read, and keeps it through a sign-out", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.auth.ready;
    await renderScreen(
      <GateProvider>
        <NavigatorHold>
          <CountedNavigator />
        </NavigatorHold>
      </GateProvider>,
      runtime,
    );
    expect(await screen.findByText("the navigator")).toBeOnTheScreen();
    expect(mounts).toHaveBeenCalledTimes(1);
    await act(async () => {
      await runtime.auth.me();
    });
    await act(async () => {
      await runtime.auth.logout();
    });
    expect(screen.getByText("the navigator")).toBeOnTheScreen();
    expect(mounts).toHaveBeenCalledTimes(1);
  });
});

describe("isBarePath", () => {
  it("matches whole segments of the bare screens, not a longer name that starts alike", () => {
    for (const path of ["/login", "/auth", "/auth/telegram", "/oauth/authorize", "/onboarding"]) {
      expect(isBarePath(path)).toBe(true);
    }
    for (const path of ["/authors", "/loginx", "/oauthz/x", "/settings", "/"]) {
      expect(isBarePath(path)).toBe(false);
    }
  });
});
