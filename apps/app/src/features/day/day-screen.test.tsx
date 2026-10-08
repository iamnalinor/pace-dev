import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { DayScreen } from "./day-screen.tsx";

describe("DayScreen", () => {
  it("logs a past block and shows it with the gap before it", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "food",
      endAt: addMinutesIso(NOW, -240),
      label: "Breakfast",
      startAt: addMinutesIso(NOW, -270),
    });
    await renderScreen(<DayScreen />, runtime);
    expect(screen.getByText("Breakfast")).toBeOnTheScreen();
    expect(screen.getByText("4h not logged")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Log past activity" }));
    await fireEvent.changeText(await screen.findByLabelText("What"), "Lecture");
    expect(screen.getByLabelText("From").props["value"]).toBe("14:30");
    expect(screen.getByLabelText("To").props["value"]).toBe("15:00");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Lecture")).toBeOnTheScreen();
    expect(screen.getByText("Tracked 1h")).toBeOnTheScreen();
  });

  it("refuses an end before the start", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<DayScreen />, runtime);
    expect(screen.getByText("Nothing recorded on this day.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Log past activity" }));
    await fireEvent.changeText(await screen.findByLabelText("What"), "Nap");
    await fireEvent.changeText(screen.getByLabelText("From"), "25:00");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The end must be after the start.")).toBeOnTheScreen();
  });

  it("moves to the previous day and back", async () => {
    await renderScreen(<DayScreen />, await createTestRuntime());
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => {
      expect(screen.getByText("Monday · Oct 5")).toBeOnTheScreen();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByText("Tuesday · Oct 6")).toBeOnTheScreen();
  });
});
