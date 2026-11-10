import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import { createRuntime } from "#app/runtime.ts";
import { controlsInsideControls } from "#app/test/nested-controls.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { paramsSet, router, searchParams, setSearchParams } from "#app/test/router.ts";
import { createTestRuntime, frozenClock } from "#app/test/runtime.ts";
import { createMemoryEventStore, createMemorySessionStore } from "@pace/client";
import { createFakeFetch, emptySyncRoutes, problem } from "@pace/client/testing";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { DayScreen } from "./day-screen.tsx";

/** Breakfast logged 10:30–11:00 and a Lecture running since 13:00: the gap between is 11:00–13:00. */
const overlapWorld = async () => {
  const runtime = await createTestRuntime();
  await runtime.actions.logPast({
    category: "food",
    endAt: addMinutesIso(NOW, -240),
    label: "Breakfast",
    startAt: addMinutesIso(NOW, -270),
  });
  // Running since 13:00: the gap before it is 11:00–13:00.
  await runtime.actions.startActivity(
    { category: "study", label: "Lecture" },
    { at: addMinutesIso(NOW, -120) },
  );
  return runtime;
};
const breakfast = (runtime: Awaited<ReturnType<typeof overlapWorld>>) =>
  Object.values(runtime.state.store.getState().time.activities).find(
    (activity) => activity.label === "Breakfast",
  );
const lectureStart = (runtime: Awaited<ReturnType<typeof overlapWorld>>) =>
  Object.values(runtime.state.store.getState().time.activities).find(
    (activity) => activity.label === "Lecture",
  )?.startAt;
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

  it("asks for the day's app usage once, though two parts of Day read it (QA 21 L5, class 79)", async () => {
    const usage = jest.fn(() => ({ sessions: [] }));
    const runtime = await createTestRuntime({ routes: { "GET /api/usage": usage } });
    await renderScreen(<DayScreen />, runtime);
    expect(await screen.findByText("Screen time")).toBeOnTheScreen();
    await waitFor(() => {
      expect(usage).toHaveBeenCalled();
    });
    expect(usage).toHaveBeenCalledTimes(1);
  });

  it("says screen time could not load instead of a zero, and Try again reads it (QA round 23 R23-08)", async () => {
    let isUp = false;
    const usage = jest.fn(() =>
      isUp
        ? {
            sessions: [
              {
                app: "code",
                deviceId: "01LAPTOP",
                deviceName: "Laptop",
                endAt: addMinutesIso(NOW, -200),
                startAt: addMinutesIso(NOW, -250),
              },
            ],
          }
        : problem(503, "offline"),
    );
    await renderScreen(
      <DayScreen />,
      await createTestRuntime({ routes: { "GET /api/usage": usage } }),
    );
    expect(await screen.findByText(en("day.screenTimeFailed"))).toBeOnTheScreen();
    expect(screen.queryByText(en("day.noApps"))).toBeNull();
    isUp = true;
    await fireEvent.press(screen.getByRole("button", { name: en("common.retry") }));
    expect(await screen.findByText("Laptop · 50m")).toBeOnTheScreen();
    expect(screen.queryByText(en("day.screenTimeFailed"))).toBeNull();
  });

  it("never shows one day's screen time on another when the next read fails (re-review N6)", async () => {
    // Today's usage arrives; then the network goes, and yesterday's read fails.
    let isUp = true;
    const usage = jest.fn(() =>
      isUp
        ? {
            sessions: [
              {
                app: "code",
                deviceId: "01LAPTOP",
                deviceName: "Laptop",
                endAt: addMinutesIso(NOW, -200),
                startAt: addMinutesIso(NOW, -250),
              },
            ],
          }
        : problem(503, "offline"),
    );
    await renderScreen(
      <DayScreen />,
      await createTestRuntime({ routes: { "GET /api/usage": usage } }),
    );
    expect(await screen.findByText("Laptop · 50m")).toBeOnTheScreen();
    isUp = false;
    await fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
    // Yesterday could not be read: it says so, never today's 50 minutes as yesterday's.
    expect(await screen.findByText(en("day.screenTimeFailed"))).toBeOnTheScreen();
    expect(screen.queryByText("Laptop · 50m")).toBeNull();
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

  it("offers Today only on another day, and it brings today back (F-CMP-05)", async () => {
    await renderScreen(<DayScreen />, await createTestRuntime());
    const today = () => screen.queryByRole("button", { name: en("period.today") });
    expect(today()).toBeNull();
    // The header is the period control alone: Week is reached from the navigation, and the time
    // bar with its Calendar is on Now. › is not offered at the present (hidden, not greyed).
    expect(screen.getByLabelText(en("period.group"))).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Week" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Calendar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next day" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => {
      expect(screen.getByText("Mon, Oct 5")).toBeOnTheScreen();
    });
    expect(screen.getByRole("button", { name: "Next day" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: en("period.today") }));
    expect(await screen.findByText("Tuesday · Oct 6")).toBeOnTheScreen();
    expect(today()).toBeNull();
    // A day picked from the month view is another day too.
    await fireEvent.press(screen.getByRole("button", { name: /Pick a day/u }));
    await fireEvent.press(await screen.findByRole("button", { name: "Thursday, October 1" }));
    expect(await screen.findByText("Thu, Oct 1")).toBeOnTheScreen();
    expect(today()).toBeOnTheScreen();
  });

  it("keeps the day in the address: a reload shows it again, Today takes the param off (feedback 5 item 6)", async () => {
    await renderScreen(<DayScreen />, await createTestRuntime());
    await fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
    expect(await screen.findByText("Mon, Oct 5")).toBeOnTheScreen();
    expect(searchParams()).toEqual({ date: "2026-10-05" });
    await fireEvent.press(screen.getByRole("button", { name: en("period.today") }));
    expect(searchParams()).toEqual({});
  });

  it("closes the open sheet when the address moves to another day, as browser Back does (review I1)", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "work",
      endAt: addMinutesIso(NOW, -240),
      label: "Team chat",
      startAt: addMinutesIso(NOW, -270),
    });
    await renderScreen(<DayScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: /Team chat/u }));
    expect(await screen.findByLabelText("What")).toHaveDisplayValue("Team chat");
    await act(() => {
      setSearchParams({ date: "2026-10-05" });
    });
    expect(screen.getByText("Mon, Oct 5")).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.queryByLabelText("What")).toBeNull();
    });
    expect(paramsSet).not.toHaveBeenCalled();
  });

  it("opens the block the address names in its form once, as Week's «Edit in Day» asks (review M3, R26-04)", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "work",
      endAt: addMinutesIso(NOW, -240),
      label: "Team chat",
      startAt: addMinutesIso(NOW, -270),
    });
    const chat = Object.values(runtime.state.store.getState().time.activities).find(
      (activity) => activity.label === "Team chat",
    );
    setSearchParams({ block: `${chat?.id ?? ""}-${addMinutesIso(NOW, -270)}`, date: "2026-10-06" });
    await renderScreen(<DayScreen />, runtime);
    expect(await screen.findByLabelText("What")).toHaveDisplayValue("Team chat");
    // Read once: the param goes, so a close does not open it again.
    await waitFor(() => {
      expect(searchParams()["block"]).toBeUndefined();
    });
  });

  it("opens the named block once the local store is read on a cold load (review M10)", async () => {
    const eventStore = createMemoryEventStore();
    const first = await createTestRuntime({ eventStore });
    await first.actions.logPast({
      category: "work",
      endAt: addMinutesIso(NOW, -240),
      label: "Team chat",
      startAt: addMinutesIso(NOW, -270),
    });
    const chat = Object.values(first.state.store.getState().time.activities).find(
      (activity) => activity.label === "Team chat",
    );
    // A cold load: the copy on the device is still being read when Day reads the address.
    const { promise: gate, resolve: release } = Promise.withResolvers<undefined>();
    const slow = {
      ...eventStore,
      listAll: async () => {
        await gate;
        return await eventStore.listAll();
      },
    };
    const runtime = await createRuntime({
      clock: frozenClock(),
      deviceId: async () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      eventStore: slow,
      fetch: createFakeFetch(emptySyncRoutes).fetch,
      session: createMemorySessionStore(),
    });
    setSearchParams({ block: `${chat?.id ?? ""}-${addMinutesIso(NOW, -270)}`, date: "2026-10-06" });
    await renderScreen(<DayScreen />, runtime);
    expect(searchParams()["block"]).toBeDefined();
    await act(async () => {
      release(undefined);
      await runtime.state.ready;
    });
    expect(await screen.findByLabelText("What")).toHaveDisplayValue("Team chat");
    await waitFor(() => {
      expect(searchParams()["block"]).toBeUndefined();
    });
  });

  it("opens nothing for a block the day does not hold, and takes the param off (review M10)", async () => {
    setSearchParams({ block: "gone-2026-10-06T06:00:00.000Z", date: "2026-10-06" });
    await renderScreen(<DayScreen />, await createTestRuntime());
    await waitFor(() => {
      expect(searchParams()["block"]).toBeUndefined();
    });
    expect(screen.queryByLabelText("What")).toBeNull();
  });

  it("opens the day the address names, and today for one it cannot read, writing nothing back", async () => {
    setSearchParams({ date: "2026-10-01" });
    const page = await renderScreen(<DayScreen />, await createTestRuntime());
    expect(screen.getByText("Thu, Oct 1")).toBeOnTheScreen();
    await page.unmount();
    for (const date of ["2026-02-30", "yesterday", "2026-10-01T00:00"]) {
      setSearchParams({ date });
      const shown = await renderScreen(<DayScreen />, await createTestRuntime());
      expect(screen.getByText("Tuesday · Oct 6")).toBeOnTheScreen();
      await shown.unmount();
    }
    expect(paramsSet).not.toHaveBeenCalled();
  });

  it("replaces one day with the next in place: the new day's rows do not fade in (F-MOT-07)", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "work",
      endAt: addMinutesIso(NOW, -1500),
      label: "Yesterday's chat",
      startAt: addMinutesIso(NOW, -1560),
    });
    await renderScreen(<DayScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => {
      expect(screen.getByText("Mon, Oct 5")).toBeOnTheScreen();
    });
    const rows = screen.getAllByTestId("day-entry");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.props["entering"]).toBeUndefined();
    }
  });

  it("has no time bar on any day: it lives on Now", async () => {
    await renderScreen(<DayScreen />, await createTestRuntime());
    expect(screen.queryByLabelText("Time")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => {
      expect(screen.getByText("Mon, Oct 5")).toBeOnTheScreen();
    });
    expect(screen.queryByLabelText("Time")).toBeNull();
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

  describe("a new block takes the start of the next one, and says so; an edit is refused (owner R27-05, R25-01)", () => {
    const overlap = "That runs into the next activity: move its start first.";
    const yields = "This time comes out of “Lecture”.";

    it("from a gap's Log", async () => {
      const runtime = await overlapWorld();
      await renderScreen(<DayScreen />, runtime);
      await fireEvent.press(screen.getByRole("button", { name: /2h not logged/u }));
      await fireEvent.changeText(await screen.findByLabelText("What"), "Reading");
      await fireEvent.changeText(screen.getByLabelText("To"), "13:30");
      expect(screen.getByText(yields)).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Reading")).toBeOnTheScreen();
      // The live block keeps its events; the timeline takes the time out of it.
      expect(lectureStart(runtime)).toBe(addMinutesIso(NOW, -120));
      expect(screen.queryByText(overlap)).toBeNull();
    });

    it("from Log past activity", async () => {
      const runtime = await overlapWorld();
      await renderScreen(<DayScreen />, runtime);
      await fireEvent.press(screen.getByRole("button", { name: "Log past activity" }));
      await fireEvent.changeText(await screen.findByLabelText("What"), "Reading");
      await fireEvent.changeText(screen.getByLabelText("From"), "12:00");
      await fireEvent.changeText(screen.getByLabelText("To"), "13:30");
      expect(screen.getByText(yields)).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Reading")).toBeOnTheScreen();
    });

    it("from a block's own form, into a logged block after it", async () => {
      const runtime = await createTestRuntime();
      // Rest 10:00–11:00 as tracked live, Lunch 11:00–12:00 logged after it.
      await runtime.actions.startActivity(
        { category: "rest", label: "Rest" },
        { at: addMinutesIso(NOW, -300) },
      );
      await runtime.actions.stopActivity({ at: addMinutesIso(NOW, -240) });
      await runtime.actions.logPast({
        category: "food",
        endAt: addMinutesIso(NOW, -180),
        label: "Lunch",
        startAt: addMinutesIso(NOW, -240),
      });
      await renderScreen(<DayScreen />, runtime);
      await fireEvent.press(screen.getByRole("button", { name: /Rest/u }));
      await fireEvent.changeText(await screen.findByLabelText("To"), "11:30");
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText(overlap)).toBeOnTheScreen();
    });
  });

  describe("a block is refused over an earlier one or one with the same start, from every way in (review I2, R26-03)", () => {
    const before = "That runs into the activity before: move its end first.";

    it("from a gap's Log, its start moved back into the logged block before: that block ends there (owner R27-05)", async () => {
      const runtime = await overlapWorld();
      await renderScreen(<DayScreen />, runtime);
      await fireEvent.press(screen.getByRole("button", { name: /2h not logged/u }));
      await fireEvent.changeText(await screen.findByLabelText("What"), "Reading");
      await fireEvent.changeText(screen.getByLabelText("From"), "10:45");
      expect(screen.getByText("This time comes out of “Breakfast”.")).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Reading")).toBeOnTheScreen();
      expect(breakfast(runtime)?.endAt).toBe(addMinutesIso(NOW, -255));
      expect(screen.queryByText(before)).toBeNull();
    });

    it("from Log past, over the whole of a logged block: it goes, and the form names it (owner R27-05)", async () => {
      const runtime = await overlapWorld();
      await renderScreen(<DayScreen />, runtime);
      await fireEvent.press(screen.getByRole("button", { name: "Log past activity" }));
      await fireEvent.changeText(await screen.findByLabelText("What"), "Reading");
      await fireEvent.changeText(screen.getByLabelText("From"), "10:30");
      await fireEvent.changeText(screen.getByLabelText("To"), "12:00");
      expect(
        screen.getByText("“Breakfast” goes entirely: this time covers all of it."),
      ).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Reading")).toBeOnTheScreen();
      expect(breakfast(runtime)).toBeUndefined();
      expect(screen.queryByText("Breakfast")).toBeNull();
    });

    it("from a block's own form, its start moved back into the live block before", async () => {
      const runtime = await createTestRuntime();
      // Rest 10:00–11:00 and Walk 11:00–12:00, both tracked live.
      await runtime.actions.startActivity(
        { category: "rest", label: "Rest" },
        { at: addMinutesIso(NOW, -300) },
      );
      await runtime.actions.startActivity(
        { category: "rest", label: "Walk" },
        { at: addMinutesIso(NOW, -240) },
      );
      await runtime.actions.stopActivity({ at: addMinutesIso(NOW, -180) });
      await renderScreen(<DayScreen />, runtime);
      await fireEvent.press(screen.getByRole("button", { name: /Walk/u }));
      await fireEvent.changeText(await screen.findByLabelText("From"), "10:30");
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText(before)).toBeOnTheScreen();
      const rest = Object.values(runtime.state.store.getState().time.activities).find(
        (activity) => activity.label === "Rest",
      );
      expect(rest?.endAt).toBe(addMinutesIso(NOW, -240));
    });

    it("lets Log past take time out of the live block it lands in, and says so (spec: as in a calendar)", async () => {
      const runtime = await overlapWorld();
      await renderScreen(<DayScreen />, runtime);
      await fireEvent.press(screen.getByRole("button", { name: "Log past activity" }));
      await fireEvent.changeText(await screen.findByLabelText("What"), "Call");
      await fireEvent.changeText(screen.getByLabelText("From"), "13:30");
      await fireEvent.changeText(screen.getByLabelText("To"), "14:00");
      expect(screen.getByText("This time comes out of “Lecture”.")).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Call")).toBeOnTheScreen();
    });

    it("renames a block run alongside across a switch of the main line (review I3)", async () => {
      const runtime = await createTestRuntime();
      await runtime.actions.startActivity(
        { category: "study", label: "Study" },
        { at: addMinutesIso(NOW, -300) },
      );
      await runtime.actions.startActivity(
        { alongside: true, category: "rest", label: "Music" },
        { at: addMinutesIso(NOW, -300) },
      );
      await runtime.actions.startActivity(
        { category: "rest", label: "Rest" },
        { at: addMinutesIso(NOW, -240) },
      );
      const music = Object.values(runtime.state.store.getState().time.activities).find(
        (activity) => activity.label === "Music",
      );
      await runtime.actions.stopActivity({
        activityId: music?.id,
        at: addMinutesIso(NOW, -180),
      });
      await renderScreen(<DayScreen />, runtime);
      await fireEvent.press(screen.getByRole("button", { name: /Music/u }));
      await fireEvent.changeText(await screen.findByLabelText("What"), "Jazz");
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(runtime.state.store.getState().time.activities[music?.id ?? ""]?.label).toBe("Jazz");
      });
    });
  });

  it("stands each rail bar beside its row: the bar takes the row's measured top and height (owner 2026-11-09)", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "food",
      endAt: addMinutesIso(NOW, -240),
      label: "Breakfast",
      startAt: addMinutesIso(NOW, -270),
    });
    await runtime.actions.startActivity(
      { category: "study", label: "Lecture" },
      { at: addMinutesIso(NOW, -60) },
    );
    await renderScreen(<DayScreen />, runtime);
    const hidden = { includeHiddenElements: true } as const;
    const rows = screen.getAllByTestId("day-entry");
    // The gap from midnight, Breakfast, the gap after it, the running Lecture: rows of their own
    // heights, a hairline between them.
    expect(rows).toHaveLength(4);
    const frames = [
      { height: 52, y: 0 },
      { height: 64, y: 53 },
      { height: 52, y: 118 },
      { height: 96, y: 171 },
    ];
    for (const [index, row] of rows.entries()) {
      await fireEvent(row, "layout", {
        nativeEvent: { layout: { width: 300, x: 0, ...frames[index] } },
      });
    }
    expect(screen.getAllByTestId("rail-bar", hidden)).toHaveLength(4);
    const bars = screen.getAllByTestId("rail-slot", hidden);
    for (const [index, bar] of bars.entries()) {
      expect(bar).toHaveStyle({ height: frames[index]?.height, top: frames[index]?.y });
    }
    // The running block's bar ends on the red now line.
    expect(screen.getByTestId("now-margin", hidden)).toHaveStyle({ top: 171 + 96 });
    expect(screen.getByTestId("day-rail", hidden)).toHaveProp("accessibilityElementsHidden", true);
  });
});
