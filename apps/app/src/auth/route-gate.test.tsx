import { screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { markOnboarded } from "#app/platform/onboarding.ts";
import { renderScreen } from "#app/test/render.tsx";
import { redirected } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";

import { RouteGate } from "./route-gate.tsx";

const renderAt = async (path: string, runtime: Awaited<ReturnType<typeof createTestRuntime>>) =>
  await renderScreen(
    <RouteGate path={path}>
      <Text>the screen</Text>
    </RouteGate>,
    runtime,
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe("RouteGate", () => {
  it.each(["/settings", "/projects", "/insights", "/history", "/calendar", "/task/abc"])(
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

  it("shows a screen to a signed-in, onboarded person", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.auth.me();
    await markOnboarded();
    await renderAt("/settings", runtime);
    expect(await screen.findByText("the screen")).toBeOnTheScreen();
    expect(redirected).not.toHaveBeenCalled();
  });
});
