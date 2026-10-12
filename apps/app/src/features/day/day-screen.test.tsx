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

  it("shows under a block where its time went on the computer", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/usage": () => ({
          sessions: [
            {
              app: "code",
              deviceId: "01LAPTOP",
              deviceName: "Laptop",
              endAt: addMinutesIso(NOW, -200),
              startAt: addMinutesIso(NOW, -250),
            },
          ],
        }),
      },
    });
    await runtime.actions.logPast({
      category: "study",
      endAt: addMinutesIso(NOW, -180),
      label: "Lecture notes",
      startAt: addMinutesIso(NOW, -240),
    });
    await renderScreen(<DayScreen />, runtime);
    expect(await screen.findByText("Laptop: code 40m")).toBeOnTheScreen();
  });

  it("refuses a start that is not a time, saying so under the field", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<DayScreen />, runtime);
    expect(screen.getByText("Nothing recorded on this day.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Log past activity" }));
    await fireEvent.changeText(await screen.findByLabelText("What"), "Nap");
    await fireEvent.changeText(screen.getByLabelText("From"), "25:00");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Type a time like 09:30.")).toBeOnTheScreen();
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
