import { fireEvent, screen } from "@testing-library/react-native";

import { pushStore } from "#app/platform/notifications.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { paceNative } from "../../../modules/pace-native/index.ts";
import { NotificationAvailability } from "./gallery-push-reasons.tsx";

it("previews notification reasons without changing push state or restarting the app", async () => {
  const restart = jest.spyOn(paceNative, "restartApp");
  const before = pushStore.getState();
  const runtime = await createTestRuntime({ world: "empty" });
  await renderScreen(<NotificationAvailability />, runtime);
  expect(screen.getByTestId("gallery-push-reasons")).toBeOnTheScreen();
  expect(screen.getByText(en("settings.push.reason.services-unavailable"))).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: en("settings.push.restart") }));
  expect(restart).not.toHaveBeenCalled();
  expect(pushStore.getState()).toBe(before);
  restart.mockRestore();
});
