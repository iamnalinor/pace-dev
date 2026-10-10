import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Calendar from "expo-calendar";

import type { PaceRuntime } from "#app/runtime.ts";
import type { FakeCalendar } from "#app/testing/calendar.fake.ts";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { TimeBar } from "./time-bar.tsx";

const calendar = Calendar as unknown as FakeCalendar;

const activities = (runtime: PaceRuntime) =>
  Object.values(runtime.state.store.getState().time.activities).filter(
    (activity) => activity.endAt === null,
  );

const running = (runtime: PaceRuntime): readonly string[] =>
  activities(runtime).map((activity) => activity.label);

beforeEach(() => {
  calendar.state.status = "undetermined";
  calendar.state.events = [];
});

describe("TimeBar", () => {
  it("has four buttons in fixed places; Rest starts on a tap and stops on the next", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    const time = screen.getByLabelText("Time");
    expect(
      within(time)
        .getAllByRole("switch")
        .map((button): unknown => button.props["accessibilityLabel"]),
    ).toEqual(["From calendar", "Rest", "Sport", "Chores"]);
    await fireEvent.press(screen.getByRole("switch", { name: "Rest" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Rest"]);
    });
    expect(screen.getByRole("switch", { checked: true, name: "Rest" })).toBeOnTheScreen();
    expect(screen.getByText("of ~30m")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("switch", { name: "Rest" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual([]);
    });
  });

  it("picks a chore from the list, and switches to it from what was running", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("switch", { name: "Rest" }));
    await fireEvent.press(screen.getByRole("switch", { name: "Chores" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Getting ready" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Getting ready"]);
    });
  });

  it("runs a sport session alongside what is running, from a long press", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("switch", { name: "Rest" }));
    await fireEvent(screen.getByRole("switch", { name: "Sport" }), "longPress");
    await fireEvent(await screen.findByLabelText("Alongside what is running"), "valueChange", true);
    await fireEvent.press(screen.getByRole("button", { name: "1h" }));
    await waitFor(() => {
      expect(running(runtime).toSorted((a, b) => a.localeCompare(b))).toEqual(["Rest", "Sport"]);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Stop: Sport" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Rest"]);
    });
  });

  it("starts what is typed at once with its length, then takes the assistant's name for it", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "POST /api/parse/activity": () => ({
          provider: "fake",
          reading: { category: "sport", expectMinutes: 20, label: "ЦСС" },
          status: "parsed",
        }),
      },
    });
    await renderScreen(<TimeBar />, runtime);
    const field = screen.getByLabelText("What are you doing?");
    await fireEvent.changeText(field, "Пошел в ЦСС, 20мин");
    await fireEvent(field, "submitEditing");
    await waitFor(() => {
      expect(activities(runtime)).toEqual([
        expect.objectContaining({ category: "sport", expectMinutes: 20, label: "ЦСС" }),
      ]);
    });
    expect(field).toHaveDisplayValue("");
  });

  it("starts the calendar's event going on now, from its start", async () => {
    calendar.state.status = "granted";
    calendar.state.events = [
      {
        allDay: false,
        endDate: addMinutesIso(NOW, 40),
        id: "ev-1",
        startDate: addMinutesIso(NOW, -50),
        title: "Алгебра, семинар",
      },
    ];
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("switch", { name: "From calendar" }));
    await waitFor(() => {
      expect(activities(runtime)).toEqual([
        expect.objectContaining({
          expectMinutes: 90,
          label: "Алгебра, семинар",
          startAt: addMinutesIso(NOW, -50),
        }),
      ]);
    });
  });

  it("asks at twice the Expect whether it still goes on; yes moves the next ask on and keeps the Expect", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.startActivity(
      { category: "rest", expectMinutes: 30, label: "Rest" },
      { at: addMinutesIso(NOW, -70) },
    );
    await renderScreen(<TimeBar />, runtime);
    expect(await screen.findByText("Still doing this?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Yes, still" }));
    await waitFor(() => {
      expect(activities(runtime)).toEqual([
        expect.objectContaining({ expectMinutes: 30, stillAt: NOW }),
      ]);
    });
    expect(screen.queryByText("Still doing this?")).toBeNull();
  });
});
