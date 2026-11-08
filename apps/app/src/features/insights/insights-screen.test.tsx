import { fireEvent, screen, within } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { paramsSet, searchParams, setSearchParams } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { InsightsScreen } from "./insights-screen.tsx";

describe("InsightsScreen", () => {
  it("keeps the week in the address, and opens the week it names (feedback 5 item 6)", async () => {
    const runtime = await createTestRuntime();
    const page = await renderScreen(<InsightsScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("insights.previous") }));
    expect(searchParams()).toEqual({ week: "2026-09-28" });
    await page.unmount();
    await renderScreen(<InsightsScreen />, runtime);
    expect(screen.getByText("Sep 28 – Oct 4")).toBeOnTheScreen();
  });

  it("shows this week for a week it cannot read, writing nothing back", async () => {
    setSearchParams({ week: "last" });
    await renderScreen(<InsightsScreen />, await createTestRuntime());
    expect(screen.getByText("Oct 5 – 11")).toBeOnTheScreen();
    expect(paramsSet).not.toHaveBeenCalled();
  });

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
