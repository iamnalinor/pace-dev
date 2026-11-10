import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { API_BASE_URL } from "#app/platform/api-base.ts";
import { serverStore } from "#app/platform/server-store.ts";
import { readServer } from "#app/platform/server.ts";
import { LoginScreen } from "#app/screens/login-screen.tsx";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { createFakeFetch, fakeInstance } from "@pace/client/testing";

import { paceNative } from "../../../modules/pace-native/index.ts";
import { ServerSwitchGate } from "./server-switch-gate.tsx";

jest.mock("expo-constants", () => ({ expoConfig: { extra: { firebaseMode: "runtime" } } }));

it("holds the saved switch after a failed restart, with no dismissal back to old login", async () => {
  const ready = { status: "ready", projectId: "project", reason: null } as const;
  jest.spyOn(paceNative, "stageFirebaseConfig").mockReturnValue(ready);
  jest.spyOn(paceNative, "commitFirebaseConfig").mockReturnValue(ready);
  jest.spyOn(paceNative, "reconcileFirebaseOrigin").mockReturnValue(ready);
  const restart = jest.spyOn(paceNative, "restartApp").mockReturnValue(false);
  serverStore.setState({ origin: API_BASE_URL });
  const runtime = await createTestRuntime({ world: "empty" });
  const reset = jest.spyOn(runtime, "resetLocalData");
  await renderScreen(
    <ServerSwitchGate>
      <LoginScreen />
    </ServerSwitchGate>,
    runtime,
  );
  const changeLabel = en("server.changeLabel", { host: new URL(API_BASE_URL).host });
  await fireEvent.press(
    screen.getByRole("button", {
      name: changeLabel,
    }),
  );
  const fake = createFakeFetch({ "GET /api/instance": () => fakeInstance });
  jest.spyOn(globalThis, "fetch").mockImplementation(fake.fetch as typeof fetch);
  await fireEvent.changeText(screen.getByLabelText(en("server.address")), "target.example");
  await fireEvent.press(screen.getByRole("button", { name: en("server.check") }));
  await fireEvent.press(await screen.findByRole("button", { name: en("server.use") }));
  expect(await screen.findByText(en("server.restartPending"))).toBeOnTheScreen();
  await expect(readServer()).resolves.toBe("https://target.example");
  expect(screen.queryByRole("button", { name: en("login.openTelegram") })).toBeNull();
  expect(screen.queryByRole("button", { name: en("common.close") })).toBeNull();
  await waitFor(() => {
    expect(restart).toHaveBeenCalledTimes(1);
  });
  restart.mockReturnValue(true);
  await fireEvent.press(screen.getByRole("button", { name: en("server.restartApp") }));
  expect(restart).toHaveBeenCalledTimes(2);
  expect(reset).toHaveBeenCalledTimes(1);
  expect(serverStore.getState().origin).toBe(API_BASE_URL);
  expect(screen.queryByRole("button", { name: en("login.openTelegram") })).toBeNull();
});
