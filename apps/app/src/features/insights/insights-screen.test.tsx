import { screen, within } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { InsightsScreen } from "./insights-screen.tsx";

describe("InsightsScreen", () => {
  it("lets a keyboard reach and scroll its body, which holds no control (QA round 11 L8)", async () => {
    await renderScreen(<InsightsScreen />, await createTestRuntime());
    const body = screen.getByLabelText("Insights, the week's numbers");
    expect(body.props).toMatchObject({ tabIndex: 0 });
  });

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

  it("draws no empty hours for a week with no focus, only a line that says so (QA round 22 R22-18)", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "sleep",
      endAt: "2026-10-06T04:00:00.000Z",
      label: "Sleep",
      startAt: "2026-10-05T20:30:00.000Z",
    });
    await renderScreen(<InsightsScreen />, runtime);
    expect(screen.getByText("Focus by hour of day")).toBeOnTheScreen();
    expect(screen.getByText("No focus time this week.")).toBeOnTheScreen();
    expect(screen.queryByTestId("hours-chart")).toBeNull();
    expect(screen.queryByText(/^Most focus/u)).toBeNull();
  });

  it("draws a bar with no project in a data colour, never the disabled one (V2-04)", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "study",
      endAt: addMinutesIso(NOW, -60),
      label: "Lecture",
      startAt: addMinutesIso(NOW, -150),
    });
    await renderScreen(<InsightsScreen />, runtime);
    const bars = within(screen.getByLabelText("Time by project")).getAllByTestId("insight-bar");
    const classes = bars.map((bar) => bar.props["className"] as string);
    expect(classes.some((name) => name.includes("bg-hue-slate-stroke"))).toBe(true);
    expect(classes.join(" ")).not.toContain("quaternary");
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
