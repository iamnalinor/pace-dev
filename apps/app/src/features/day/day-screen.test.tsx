import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import { controlsInsideControls } from "#app/test/nested-controls.ts";
import { renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
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

  it("offers Back to today only on another day, and it brings today back", async () => {
    await renderScreen(<DayScreen />, await createTestRuntime());
    const back = () => screen.queryByRole("button", { name: "Back to today" });
    expect(back()).toBeNull();
    // The header is the arrows and the day picker alone: Week is reached from the navigation,
    // and the only Calendar is the time bar's.
    expect(screen.queryByRole("button", { name: "Week" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Calendar" })).toEqual([
      within(screen.getByLabelText("Time")).getByRole("button", { name: "Calendar" }),
    ]);
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => {
      expect(screen.getByText("Monday · Oct 5")).toBeOnTheScreen();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Back to today" }));
    expect(await screen.findByText("Tuesday · Oct 6")).toBeOnTheScreen();
    expect(back()).toBeNull();
    // A day picked from the month view is another day too.
    await fireEvent.press(screen.getByRole("button", { name: "Pick a day" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Thursday, October 1" }));
    expect(await screen.findByText("Thursday · Oct 1")).toBeOnTheScreen();
    expect(back()).toBeOnTheScreen();
  });

  it("has the time bar at its foot on today only: Calendar, Task, Chores and Rest, no «⋯»", async () => {
    await renderScreen(<DayScreen />, await createTestRuntime());
    const bar = screen.getByLabelText("Time");
    expect(
      ["Calendar", "Task", "Chores", "Rest"].map(
        (name) => within(bar).getByRole("button", { name }).props["accessibilityLabel"] as unknown,
      ),
    ).toEqual(["Calendar", "Task", "Chores", "Rest"]);
    expect(screen.queryByRole("button", { name: /More about/u })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Time")).toBeNull();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Back to today" }));
    expect(await screen.findByLabelText("Time")).toBeOnTheScreen();
  });

  it("opens each bar button's picker from Day on a phone, and a pick lands in the timeline", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<DayScreen />, runtime);
    const bar = () => screen.getByLabelText("Time");
    await fireEvent.press(within(bar()).getByRole("button", { name: "Task" }));
    expect(await screen.findByLabelText("Find a task")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await fireEvent.press(within(bar()).getByRole("button", { name: "Calendar" }));
    expect(
      await screen.findByRole("button", { name: "Start a meeting without an event" }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await fireEvent.press(within(bar()).getByRole("button", { name: "Chores" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Dishes" }));
    await waitFor(() => {
      expect(within(bar()).getByRole("button", { name: "Chores, running" })).toBeOnTheScreen();
    });
    await fireEvent.press(within(bar()).getByRole("button", { name: "Rest" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Short break" }));
    await waitFor(() => {
      expect(within(bar()).getByRole("button", { name: "Rest, running" })).toBeOnTheScreen();
    });
    expect(screen.getAllByText("Short break").length).toBeGreaterThan(0);
    expect(runtime.state.store.getState().time.activities).not.toEqual({});
  });

  it("links a block's task on a line of its own, not inside the row's button", async () => {
    const runtime = await createTestRuntime();
    const taskId =
      Object.values(runtime.state.store.getState().tasks.byId).find(
        (task) => task.title === "Algebra HW 6",
      )?.id ?? "";
    // Focus on it for the last 40 minutes.
    await runtime.actions.startActivity(
      { category: "task", label: "Algebra HW 6", taskId },
      { at: addMinutesIso(NOW, -40) },
    );
    // Another block on it, named otherwise.
    await runtime.actions.logPast({
      category: "study",
      endAt: addMinutesIso(NOW, -90),
      label: "Reading for it",
      startAt: addMinutesIso(NOW, -120),
    });
    const reading = Object.values(runtime.state.store.getState().time.activities).find(
      (activity) => activity.label === "Reading for it",
    );
    await runtime.actions.relabelActivity(reading?.id ?? "", { taskId });
    await renderScreen(<DayScreen />, runtime);
    // A link inside a button is a nested control: screen readers skip it, axe refuses it.
    expect(controlsInsideControls()).toEqual([]);
    // The block named after the task says Open task, not its title a second time; the other one
    // shows the task it was for. A screen reader hears the task's name on both: a list of
    // "Open task" links says nothing about where each one goes.
    expect(screen.getAllByRole("link", { name: "Open task: Algebra HW 6" })).toHaveLength(2);
    await fireEvent.press(screen.getByText("Open task"));
    expect(router.push).toHaveBeenCalledWith(`/task/${taskId}`);
  });

  it("lists blocks and gaps as one timeline: a gap is a quiet row with its hours and Log", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "food",
      endAt: addMinutesIso(NOW, -240),
      label: "Breakfast",
      startAt: addMinutesIso(NOW, -270),
    });
    await runtime.actions.logPast({
      category: "study",
      endAt: addMinutesIso(NOW, -60),
      label: "Lecture",
      startAt: addMinutesIso(NOW, -120),
    });
    await renderScreen(<DayScreen />, runtime);
    // 10:30–11:00 Breakfast, 11:00–13:00 not logged, 13:00–14:00 Lecture, then up to now.
    const gap = screen.getByRole("button", { name: /2h not logged/u });
    expect(within(gap).getByText("11:00 – 13:00")).toBeOnTheScreen();
    expect(within(gap).getByText("Log")).toBeOnTheScreen();
    await fireEvent.press(gap);
    expect(await screen.findByLabelText("From")).toHaveProp("value", "11:00");
    expect(screen.getByLabelText("To")).toHaveProp("value", "13:00");
  });
});
