import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { SettingsScreen } from "#app/screens/settings-screen.tsx";
import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SettingsScreen", () => {
  it("saves digest times as they are typed, adds and removes one", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    const settings = () => runtime.state.store.getState().settings;
    const first = screen.getByLabelText(en("settings.digestWindows.time", { index: 1 }));
    await fireEvent.changeText(first, "8");
    // Half a time is never stored.
    expect(settings().digestWindows[0]).toBe("09:00");
    await fireEvent.changeText(first, "0830");
    await waitFor(() => {
      expect(settings().digestWindows[0]).toBe("08:30");
    });
    await fireEvent.press(screen.getByRole("button", { name: en("settings.digestWindows.add") }));
    await waitFor(() => {
      expect(settings().digestWindows).toHaveLength(4);
    });
    await fireEvent.press(
      screen.getByRole("button", { name: en("settings.digestWindows.remove", { time: "12:00" }) }),
    );
    await waitFor(() => {
      expect(settings().digestWindows).toHaveLength(3);
    });
  });

  it("saves the quiet hours and opens the pages behind the links", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<SettingsScreen />, runtime);
    await fireEvent.changeText(screen.getByLabelText(en("settings.quietHours.from")), "2230");
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.quietHours.from).toBe("22:30");
    });
    const presetsLink = `${en("settings.presets")} ${en("settings.presets.hint")}`;
    await fireEvent.press(screen.getByRole("link", { name: presetsLink }));
    expect(router.push).toHaveBeenCalledWith("/presets");
  });

  it("logs out and goes to the login card", async () => {
    await renderScreen(<SettingsScreen />, await createTestRuntime({ world: "empty" }));
    await fireEvent.press(screen.getByRole("button", { name: en("settings.logout") }));
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/login");
    });
  });
});
