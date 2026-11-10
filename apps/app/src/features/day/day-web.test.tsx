import { screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { problem } from "@pace/client/testing";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { DayScreen } from "./day-screen.tsx";

// The web build: no phone sections, and no screen time of its own.
jest.mock("#app/platform/device.ts", () => ({ IS_PHONE: false }));

const LAPTOP = {
  app: "code",
  deviceId: "01LAPTOP",
  deviceName: "Laptop",
  endAt: addMinutesIso(NOW, -200),
  startAt: addMinutesIso(NOW, -250),
};

describe("Day on the web: screen time only for what a phone or a computer sent (QA PR55-1-08)", () => {
  it("shows no screen time section on a day nothing was sent for", async () => {
    const usage = jest.fn(() => ({ sessions: [] }));
    await renderScreen(
      <DayScreen />,
      await createTestRuntime({ routes: { "GET /api/usage": usage } }),
    );
    await waitFor(() => {
      expect(usage).toHaveBeenCalled();
    });
    expect(screen.queryByText(en("day.screenTime"))).toBeNull();
    expect(screen.queryByText(en("day.noApps"))).toBeNull();
  });

  it("shows a computer's screen time when it sent some", async () => {
    await renderScreen(
      <DayScreen />,
      await createTestRuntime({ routes: { "GET /api/usage": () => ({ sessions: [LAPTOP] }) } }),
    );
    expect(await screen.findByText("Laptop · 50m")).toBeOnTheScreen();
    expect(screen.getByText(en("day.screenTime"))).toBeOnTheScreen();
  });

  it("offers no retry for screen time that was never there to load", async () => {
    const usage = jest.fn(() => problem(503, "offline"));
    await renderScreen(
      <DayScreen />,
      await createTestRuntime({ routes: { "GET /api/usage": usage } }),
    );
    await waitFor(() => {
      expect(usage).toHaveBeenCalled();
    });
    expect(screen.queryByText(en("day.screenTimeFailed"))).toBeNull();
    expect(screen.queryByRole("button", { name: en("common.retry") })).toBeNull();
  });
});
