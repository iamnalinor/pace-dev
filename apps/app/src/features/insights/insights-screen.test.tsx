import { screen, within } from "@testing-library/react-native";

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
    // Study is focus: 12:30–14:00 Moscow by hour, one unbroken block.
    expect(screen.getByText("Most focus between 13:00 and 14:00")).toBeOnTheScreen();
    expect(screen.getByLabelText("Typical focus block: 1h 30m")).toBeOnTheScreen();
  });

  it("puts the night before next to the day's focus", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "sleep",
      endAt: "2026-10-06T04:00:00.000Z",
      label: "Sleep",
      startAt: "2026-10-05T20:30:00.000Z",
    });
    await renderScreen(<InsightsScreen />, runtime);
    const card = screen.getByLabelText("Sleep and focus");
    expect(within(card).getByText("7h 30m")).toBeOnTheScreen();
  });
});
