import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Calendar from "expo-calendar";
import * as SecureStore from "expo-secure-store";

import type { FakeCalendar } from "#app/testing/calendar.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { controlsInsideControls } from "#app/test/nested-controls.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { rowsInFlattenableBoxes } from "#app/test/sliding-rows.ts";
import { DISSOLVE_MS } from "#app/ui/dissolve.tsx";
import { addMinutesIso, calendarEventKey } from "@pace/core";
import { HW_ID, NOW } from "@pace/core/testing";

import { ComposerProvider } from "./composer/composer-flow.tsx";
import { NowBoard } from "./now-screen.tsx";

/** Now's list as the screen draws it, over the composer's state. */
const Board = () => (
  <ComposerProvider>
    <NowBoard />
  </ComposerProvider>
);

const calendar = Calendar as unknown as FakeCalendar;

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as FakeSecureStore).values.clear();
  calendar.state.status = "undetermined";
  calendar.state.events = [];
});

/** A seminar in the phone's calendar, starting five minutes after the frozen clock. */
const seminarSoon = (): void => {
  calendar.state.status = "granted";
  calendar.state.events = [
    {
      allDay: false,
      endDate: addMinutesIso(NOW, 95),
      id: "ev-1",
      startDate: addMinutesIso(NOW, 5),
      title: "Seminar",
    },
  ];
};

/** A world where a walk (Rest's choice) has run for `minutes`. */
const walkSince = async (minutes: number) => {
  const runtime = await createTestRuntime();
  await runtime.actions.startActivity(
    { buttonId: "rest:walk", category: "rest", expectMinutes: 30, label: "Walk" },
    { at: addMinutesIso(NOW, -minutes) },
  );
  return runtime;
};

const checks = (): readonly string[] =>
  screen
    .getAllByRole("checkbox", { name: /^Mark .* done$/ })
    .map((button) => String(button.props["accessibilityLabel"]));

describe("NowBoard", () => {
  it("lists the artboard rows by deadline with their meta lines", async () => {
    await renderScreen(<Board />, await createTestRuntime());
    expect(screen.getByText("Tuesday · Oct 6")).toBeOnTheScreen();
    expect(screen.getByText("Now")).toBeOnTheScreen();
    expect(checks()).toEqual([
      "Mark Calculus HW 5 done",
      "Mark Algebra HW 6 done",
      "Mark History HW 1 done",
      "Mark Prepare demo for Friday done",
      "Mark Flaky latency test in nightly done",
      "Mark Calculus HW 6 done",
      "Mark Return library books done",
      "Mark RFC: dedicated runner pool done",
      "Mark Reply to course curator done",
    ]);
    expect(
      screen.getByText("Due tomorrow 23:59 · 1d 8h left · 4/7 solved · 2 sent"),
    ).toBeOnTheScreen();
    // The project (else the category) and the importance are coloured tags before the meta text.
    expect(screen.getAllByText("ASAP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Normal").length).toBeGreaterThan(0);
    expect(screen.getByText("15h late · 2 subtasks left")).toBeOnTheScreen();
    expect(screen.getByText("12d old")).toBeOnTheScreen();
    expect(screen.getAllByText("Nice-to-have").length).toBeGreaterThan(0);
    expect(screen.getByText("Due Oct 9 18:00 UTC (your time 21:00)")).toBeOnTheScreen();
    expect(screen.getAllByText("Algebra").length).toBeGreaterThan(0);
    // The time bar is on Day now.
    expect(screen.queryByLabelText(en("time.whatDoing"))).toBeNull();
  });

  it("opens a task from its row, and has no Inbox counter of its own (that is in the navigation)", async () => {
    await renderScreen(<Board />, await createTestRuntime());
    expect(screen.queryByRole("button", { name: /^Inbox/ })).toBeNull();
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(router.push).toHaveBeenCalledWith(`/task/${HW_ID}`);
  });

  it("checks a task off: it dissolves, then closes, without a toast (History undoes it)", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Board />, runtime);
    const check = screen.getByRole("checkbox", { name: "Mark Reply to course curator done" });
    await fireEvent.press(check);
    // Checked at once while it turns to dust; written once the dust has gone.
    expect(check).toBeChecked();
    const closed = () =>
      Object.values(runtime.state.store.getState().tasks.byId).find(
        (task) => task.title === "Reply to course curator",
      )?.closed;
    expect(closed()).toBeNull();
    await waitFor(() => {
      expect(closed()).not.toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByText("Reply to course curator")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    await runtime.actions.undoLast();
    await waitFor(() => {
      expect(screen.getByText("Reply to course curator")).toBeOnTheScreen();
    });
  });

  describe("a checked task whose close is still being written", () => {
    const TITLE = "Reply to course curator";
    const CHECK = { name: `Mark ${TITLE} done` };

    /** Checks the row, lets the dust run out, and holds the close until the test settles it. */
    const checkAndHold = async () => {
      jest.useFakeTimers();
      const runtime = await createTestRuntime();
      const close = Promise.withResolvers<Awaited<ReturnType<typeof runtime.actions.closeTask>>>();
      const closeTask = jest.spyOn(runtime.actions, "closeTask").mockReturnValue(close.promise);
      await renderScreen(<Board />, runtime);
      await fireEvent.press(screen.getByRole("checkbox", CHECK));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(DISSOLVE_MS + 50);
      });
      return { close, closeTask };
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it("stays gone while the close is pending: the dust does not hand it back", async () => {
      const { close, closeTask } = await checkAndHold();
      expect(closeTask).toHaveBeenCalledTimes(1);
      // The store has not dropped the row yet, but it must not show again, checked or not.
      expect(screen.queryByText(TITLE)).toBeNull();
      expect(screen.queryByRole("checkbox", CHECK)).toBeNull();
      await act(async () => {
        close.resolve({ ok: true, value: [] });
        await jest.advanceTimersByTimeAsync(500);
      });
      expect(screen.queryByText(TITLE)).toBeNull();
    });

    it("comes back, unchecked, when the close is refused", async () => {
      const { close } = await checkAndHold();
      expect(screen.queryByText(TITLE)).toBeNull();
      await act(async () => {
        close.resolve({ ok: false, error: "action/invalid-input" });
        await jest.advanceTimersByTimeAsync(500);
      });
      expect(screen.getByRole("checkbox", CHECK)).not.toBeChecked();
      expect(screen.getByText(TITLE)).toBeOnTheScreen();
      expect(screen.getByText(en("actionError.action/invalid-input"))).toBeOnTheScreen();
    });
  });

  it("opens the submit sheet for a per-subtask task instead of closing it", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Board />, runtime);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Algebra HW 6 done" }));
    expect(router.push).toHaveBeenCalledWith(`/task/${HW_ID}?close=1`);
    expect(runtime.state.store.getState().tasks.byId[HW_ID]?.closed).toBeNull();
  });

  it("filters by project and folds the tasks that start later under In future", async () => {
    await renderScreen(<Board />, await createTestRuntime());
    const chips = screen.getByLabelText("Filter by project");
    await fireEvent.press(within(chips).getByRole("radio", { name: "Work" }));
    expect(checks()).toEqual([
      "Mark Prepare demo for Friday done",
      "Mark Flaky latency test in nightly done",
      "Mark RFC: dedicated runner pool done",
    ]);
    await fireEvent.press(screen.getByRole("radio", { name: "All" }));
    expect(checks()).toHaveLength(9);
    const fold = screen.getByRole("button", { name: "In future · 4" });
    expect(screen.queryByText("Check test 1 grade")).toBeNull();
    await fireEvent.press(fold);
    expect(screen.getByText("Check test 1 grade")).toBeOnTheScreen();
    expect(screen.getByText(/^Starts Oct 20/u)).toBeOnTheScreen();
  });

  it("offers the device zone when the account sits in another one", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC" });
    await renderScreen(<Board />, runtime);
    expect(
      screen.getByText(en("zone.banner", { account: "Europe/Moscow", device: "UTC" })),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Use UTC" }));
    await waitFor(() => {
      expect(runtime.state.store.getState().settings.timezone).toBe("UTC");
    });
    expect(screen.queryByRole("button", { name: "Use UTC" })).toBeNull();
  });

  it("offers a calendar event about to start: Attend tracks it under its title", async () => {
    seminarSoon();
    const runtime = await createTestRuntime();
    await renderScreen(<Board />, runtime);
    const card = await screen.findByLabelText("From your calendar");
    expect(within(card).getByText("Seminar")).toBeOnTheScreen();
    await fireEvent.press(within(card).getByRole("button", { name: "Attend" }));
    await waitFor(() => {
      expect(
        Object.values(runtime.state.store.getState().time.activities).map((a) => a.label),
      ).toContain("Seminar");
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("From your calendar")).toBeNull();
    });
  });

  describe("Attend on an Android phone in Moscow (the owner's 13:47, a 12:15–15:20 colloquium)", () => {
    /** 13:47 in Moscow (UTC+3): what the phone's clock read in the owner's screenshot. */
    const AT = "2026-10-14T10:47:00.000Z";
    const TITLE = "Коллоквиум по матанализу";

    /** The event as expo-calendar's Android module hands it out: UTC strings with ".SSSZ". */
    const androidEvent = (startOffsetMinutes: number, endOffsetMinutes: number): void => {
      calendar.state.status = "granted";
      calendar.state.events = [
        {
          allDay: false,
          endDate: addMinutesIso(AT, endOffsetMinutes),
          id: "ev-android",
          recurrenceRule: null,
          startDate: addMinutesIso(AT, startOffsetMinutes),
          title: TITLE,
        },
      ];
    };

    it.each([
      ["going on for 92 minutes (the owner's)", -92, 93],
      ["started 10 minutes ago", -10, 80],
      ["started a second ago", -1 / 60, 60],
      ["starting in a second", 1 / 60, 60],
      ["starting in 2 minutes", 2, 60],
      ["starting in 9 minutes", 9, 60],
    ])("%s: starts it, no refusal", async (_name, start, end) => {
      androidEvent(start, end);
      const runtime = await createTestRuntime({
        deviceTz: "Europe/Moscow",
        now: AT,
        world: "empty",
      });
      await renderScreen(<Board />, runtime);
      const card = await screen.findByLabelText("From your calendar");
      expect(within(card).getByText(TITLE)).toBeOnTheScreen();
      await fireEvent.press(within(card).getByRole("button", { name: "Attend" }));
      await waitFor(() => {
        expect(screen.queryByLabelText("From your calendar")).toBeNull();
      });
      expect(screen.queryByText(en("actionError.retro/future"))).toBeNull();
      const [started] = Object.values(runtime.state.store.getState().time.activities);
      expect(started?.label).toBe(TITLE);
      // From its start once that has passed, else from the tap.
      expect(started?.startAt).toBe(start < 0 ? addMinutesIso(AT, start) : AT);
    });

    it("with something running since 13:00: the event takes over from it, no refusal", async () => {
      androidEvent(-92, 93);
      const runtime = await createTestRuntime({
        deviceTz: "Europe/Moscow",
        now: AT,
        world: "empty",
      });
      await runtime.actions.startTyped("Reading");
      await runtime.actions.adjustActivity(
        Object.values(runtime.state.store.getState().time.activities)[0]?.id ?? "",
        { startAt: addMinutesIso(AT, -47) },
      );
      await renderScreen(<Board />, runtime);
      const card = await screen.findByLabelText("From your calendar");
      await fireEvent.press(within(card).getByRole("button", { name: "Attend" }));
      await waitFor(() => {
        expect(screen.queryByLabelText("From your calendar")).toBeNull();
      });
      expect(screen.queryByText(en("actionError.retro/future"))).toBeNull();
    });
  });

  it("keeps the task rows in a box of their own, so the calendar card above cannot move them", async () => {
    // On Android the renderer flattens a View that only lays out: the rows would become children
    // of the scroll view, the card's arrival would move each row's own frame, and their layout
    // transitions started (and on the owner's phone stuck) from where they were, over the card.
    seminarSoon();
    await renderScreen(<Board />, await createTestRuntime());
    await screen.findByLabelText("From your calendar");
    expect(checks().length).toBeGreaterThan(0);
    expect(rowsInFlattenableBoxes()).toEqual([]);
  });

  it("hides a calendar event on Skip, and skips it on every channel", async () => {
    seminarSoon();
    const skip = jest.fn(() => ({ ok: true }));
    const runtime = await createTestRuntime({ routes: { "POST /api/calendar/skip": skip } });
    await renderScreen(<Board />, runtime);
    const card = await screen.findByLabelText("From your calendar");
    await fireEvent.press(within(card).getByRole("button", { name: "Skip" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("From your calendar")).toBeNull();
    });
    expect(Object.values(runtime.state.store.getState().time.activities)).toEqual([]);
    const eventKey = calendarEventKey({ startAt: addMinutesIso(NOW, 5), title: "Seminar" });
    await waitFor(() => {
      expect(skip).toHaveBeenCalledWith(expect.objectContaining({ body: { eventKey } }));
    });
  });

  describe("what runs, in one compact row (the time bar lives on Day)", () => {
    it("has no row and no time bar while nothing runs", async () => {
      await renderScreen(<Board />, await createTestRuntime());
      expect(screen.queryByLabelText(en("time.running"))).toBeNull();
      expect(screen.queryByLabelText(en("time.bar"))).toBeNull();
      expect(screen.queryByRole("button", { name: /^Stop/u })).toBeNull();
    });

    it("shows the category, the label and the time it has run; Stop stops it and the row goes", async () => {
      const runtime = await walkSince(25);
      await renderScreen(<Board />, runtime);
      const row = screen.getByLabelText(en("time.running"));
      expect(within(row).getByText("Rest")).toBeOnTheScreen();
      expect(within(row).getByText("Walk")).toBeOnTheScreen();
      expect(within(row).getByText("25m")).toBeOnTheScreen();
      await fireEvent.press(within(row).getByRole("button", { name: "Stop: Walk" }));
      await waitFor(() => {
        expect(screen.queryByLabelText(en("time.running"))).toBeNull();
      });
      expect(
        Object.values(runtime.state.store.getState().time.activities).filter(
          (activity) => activity.endAt === null,
        ),
      ).toEqual([]);
    });

    it("opens Day on a tap on the row", async () => {
      await renderScreen(<Board />, await walkSince(5));
      const row = screen.getByRole("link", { name: /Walk/u });
      expect(row.props["accessibilityHint"]).toBe(en("time.openDay"));
      await fireEvent.press(row);
      expect(router.push).toHaveBeenCalledWith("/day");
    });

    it("keeps the task rows in their own box under it, so its arrival cannot move them", async () => {
      await renderScreen(<Board />, await walkSince(5));
      expect(screen.getByLabelText(en("time.running"))).toBeOnTheScreen();
      expect(checks().length).toBeGreaterThan(0);
      expect(rowsInFlattenableBoxes()).toEqual([]);
      // The row's link to Day and its Stop sit side by side, neither inside the other.
      expect(controlsInsideControls()).toEqual([]);
    });
  });

  it("shows the empty state on a fresh account", async () => {
    await renderScreen(<Board />, await createTestRuntime({ world: "empty" }));
    expect(screen.getByText(en("now.empty"))).toBeOnTheScreen();
  });
});
