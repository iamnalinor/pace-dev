import { fireEvent, screen } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { WeekScreen } from "./week-screen.tsx";

describe("WeekScreen", () => {
  it("lays the week's tracked time and calendar on one grid; a block tells where its time went", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/calendar": () => ({
          events: [
            {
              endAt: addMinutesIso(NOW, -60),
              id: "ev-1",
              series: null,
              startAt: addMinutesIso(NOW, -150),
              title: "Seminar",
            },
          ],
        }),
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
    await renderScreen(<WeekScreen />, runtime);
    expect(
      await screen.findByRole("button", { name: "From the calendar: Seminar" }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: /^Lecture notes, / }));
    expect(await screen.findByText("Study · 1h")).toBeOnTheScreen();
    expect(screen.getByText("Laptop: code 40m")).toBeOnTheScreen();
  });
});
