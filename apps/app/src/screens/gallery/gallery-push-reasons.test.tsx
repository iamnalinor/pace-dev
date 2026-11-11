import { fireEvent, screen, within } from "@testing-library/react-native";

import { pushStore } from "#app/platform/notifications.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { paceNative } from "../../../modules/pace-native/index.ts";
import { ServerSections } from "./gallery-push-reasons.tsx";

it("previews server and notification reasons without changing push state or restarting the app", async () => {
  const restart = jest.spyOn(paceNative, "restartApp");
  const before = pushStore.getState();
  const runtime = await createTestRuntime({ world: "empty" });
  await renderScreen(<ServerSections />, runtime);
  expect(screen.getByTestId("gallery-push-reasons")).toBeOnTheScreen();
  expect(screen.getByText(en("settings.push.reason.services-unavailable"))).toBeOnTheScreen();
  const reasons = within(screen.getByTestId("gallery-push-reasons"));
  await fireEvent.press(reasons.getByRole("button", { name: en("settings.push.restart") }));
  expect(restart).not.toHaveBeenCalled();
  expect(pushStore.getState()).toBe(before);
  restart.mockRestore();
});

it("shows the sync strip's server-problem card at its longest, beside its Retry", async () => {
  const runtime = await createTestRuntime({ world: "empty" });
  await renderScreen(<ServerSections />, runtime);
  const strips = within(screen.getByTestId("gallery-configuration-strip"));
  expect(strips.getByText(en("server.firebaseDuplicatePackage"))).toBeOnTheScreen();
  expect(strips.getAllByRole("button", { name: en("sync.retry") })).toHaveLength(2);
});

it("shows the restart gate for a long address, and a press there says it failed without restarting", async () => {
  const restart = jest.spyOn(paceNative, "restartApp");
  const runtime = await createTestRuntime({ world: "empty" });
  await renderScreen(<ServerSections />, runtime);
  const gate = within(screen.getByTestId("gallery-server-restart"));
  expect(gate.getByText(en("server.restartPending"))).toBeOnTheScreen();
  await fireEvent.press(gate.getByRole("button", { name: en("server.restartApp") }));
  expect(gate.getByText(en("server.restartFailed"))).toBeOnTheScreen();
  expect(restart).not.toHaveBeenCalled();
  restart.mockRestore();
});
