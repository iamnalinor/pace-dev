import { screen } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { InsightsScreen } from "./insights-screen.tsx";

describe("InsightsScreen", () => {
  it("says so when nothing is tracked", async () => {
    await renderScreen(<InsightsScreen />, await createTestRuntime());
    expect(screen.getByText("Nothing tracked this week yet.")).toBeOnTheScreen();
  });

  it("draws the week's time by category with the value as text", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "study",
      endAt: addMinutesIso(NOW, -60),
      label: "Lecture",
      startAt: addMinutesIso(NOW, -150),
    });
    await renderScreen(<InsightsScreen />, runtime);
    expect(screen.getByText("1h 30m tracked")).toBeOnTheScreen();
    expect(screen.getByLabelText("Time by category")).toBeOnTheScreen();
    expect(screen.getByLabelText("Study: 1h 30m")).toBeOnTheScreen();
  });
});
