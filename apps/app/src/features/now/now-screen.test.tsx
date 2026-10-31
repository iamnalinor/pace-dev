import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Calendar from "expo-calendar";
import * as SecureStore from "expo-secure-store";

import type { FakeCalendar } from "#app/testing/calendar.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { setSeriesRule } from "#app/platform/phone-memory.ts";
import { heldRoute } from "#app/test/held-route.ts";
import { controlsInsideControls } from "#app/test/nested-controls.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { rowsInFlattenableBoxes } from "#app/test/sliding-rows.ts";
import { DISSOLVE_MS } from "#app/ui/dissolve.tsx";
import { addMinutesIso, calendarEventKey } from "@pace/core";
import { HW_ID, NOW, rentSeriesEvents } from "@pace/core/testing";

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
  (SecureStore as unknown as FakeSecureStore).values.set("pace.session", "session-test");
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

const rowLayouts = (node: unknown): readonly unknown[] => {
  if (Array.isArray(node)) {
    return node.flatMap((child) => rowLayouts(child));
  }
  if (node === null || typeof node !== "object" || !("props" in node)) {
    return [];
  }
  const view = node as {
    readonly props: { readonly role?: string; readonly layout?: unknown };
    readonly children?: unknown;
  };
  return [
    ...(view.props.role === "listitem" ? [view.props.layout] : []),
    ...rowLayouts(view.children),
  ];
};

describe("NowBoard", () => {
  it("shows two compact groups when both dated and undated tasks exist", async () => {
    await renderScreen(<Board />, await createTestRuntime());
    expect(screen.getByText(en("now.withDeadline"))).toBeOnTheScreen();
    expect(screen.getByText(en("now.withoutDeadline"))).toBeOnTheScreen();
    expect(checks()).toHaveLength(6);
    const title = en("now.withDeadline");
    const expand = screen.getByRole("button", { name: en("now.expandGroup", { title }) });
    await fireEvent.press(expand);
    expect(checks()).toHaveLength(9);
    const collapse = screen.getByRole("button", { name: en("now.collapseGroup", { title }) });
    await fireEvent.press(collapse);
    expect(checks()).toHaveLength(6);
  });

  it("uses a plain list when filtering leaves only one type of task", async () => {
    await renderScreen(<Board />, await createTestRuntime());
    const chips = screen.getByLabelText("Filter by project");
    await fireEvent.press(within(chips).getByRole("radio", { name: "Algebra" }));
    expect(screen.queryByText(en("now.withDeadline"))).toBeNull();
    expect(screen.queryByText(en("now.withoutDeadline"))).toBeNull();
    expect(checks()).toEqual(["Mark Algebra HW 6 done"]);
  });

  it("does not move task rows with a layout animation when switching projects", async () => {
    const rendered = await renderScreen(<Board />, await createTestRuntime());
    const chips = screen.getByLabelText("Filter by project");
    await fireEvent.press(within(chips).getByRole("radio", { name: "Algebra" }));
    const layouts = rowLayouts(rendered.toJSON());
    expect(layouts.length).toBeGreaterThan(0);
    expect(layouts.every((layout) => layout === undefined)).toBe(true);
  });

  it("lists the artboard rows by deadline with their meta lines", async () => {
    await renderScreen(<Board />, await createTestRuntime());
    expect(screen.getByText("Tuesday · Oct 6")).toBeOnTheScreen();
    expect(screen.getByText("Now")).toBeOnTheScreen();
    const title = en("now.withDeadline");
    const expand = screen.getByRole("button", { name: en("now.expandGroup", { title }) });
    await fireEvent.press(expand);
    expect(checks()).toEqual([
      "Mark Calculus HW 5 done",
      "Mark Algebra HW 6 done",
      "Mark History HW 1 done",
      "Mark Prepare demo for Friday done",
      "Mark Flaky latency test in nightly done",
      "Mark Calculus HW 6 done",
      "Mark Reply to course curator done",
      "Mark RFC: dedicated runner pool done",
      "Mark Return library books done",
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
    expect(screen.getByLabelText(en("time.whatDoing"))).toBeOnTheScreen();
  });

  it("marks the rows of repeating tasks, and the final deadline once the main one passed", async () => {
    const late = "2026-11-02T12:00:00.000Z";
    const runtime = await createTestRuntime({ now: late });
    await runtime.state.ingest(rentSeriesEvents());
    await renderScreen(<Board />, runtime);
    const title = en("now.withDeadline");
    await fireEvent.press(screen.getByRole("button", { name: en("now.expandGroup", { title }) }));
    const repeats = en("meta.repeats");
    const rent = screen.getByRole("link", { name: /^Rent/u });
    expect(within(rent).getByRole("image", { name: repeats })).toBeOnTheScreen();
    expect(within(rent).getByText(/late · final deadline Nov 7 23:59/u)).toBeOnTheScreen();
    const books = screen.getByRole("link", { name: /^Return library books/u });
    expect(within(books).queryByRole("image", { name: repeats })).toBeNull();
  });

  it("opens a task from its row, and has no Inbox counter of its own (that is in the navigation)", async () => {
    await renderScreen(<Board />, await createTestRuntime());
    expect(screen.queryByRole("button", { name: /^Inbox/ })).toBeNull();
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(router.push).toHaveBeenCalledWith(`/task/${HW_ID}`);
  });

  it("checks a task off, then offers Undo while the row is gone", async () => {
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
    await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
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
    expect(checks()).toHaveLength(6);
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

  it("skips a calendar event on every channel, and hides it once that went through", async () => {
    seminarSoon();
    const skip = heldRoute();
    const runtime = await createTestRuntime({ routes: { "POST /api/calendar/skip": skip.route } });
    await renderScreen(<Board />, runtime);
    const card = await screen.findByLabelText("From your calendar");
    await fireEvent.press(within(card).getByRole("button", { name: "Skip" }));
    await waitFor(() => {
      expect(skip.waiting()).toBe(1);
    });
    const eventKey = calendarEventKey({ startAt: addMinutesIso(NOW, 5), title: "Seminar" });
    expect(skip.calls).toEqual([{ eventKey, from: "app" }]);
    expect(screen.getByLabelText("From your calendar")).toBeOnTheScreen();
    await act(async () => {
      skip.answer({ ok: true });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("From your calendar")).toBeNull();
    });
    expect(Object.values(runtime.state.store.getState().time.activities)).toEqual([]);
  });

  it("drops the card of a series answered for good on Day while Now stays open (bug class 8)", async () => {
    // Now is a tab: it stays mounted while Day remembers "every time" for the series.
    calendar.state.status = "granted";
    calendar.state.events = [
      {
        allDay: false,
        calendarId: "cal-1",
        endDate: addMinutesIso(NOW, 95),
        id: "standup-6",
        recurrenceRule: { frequency: "daily" },
        startDate: addMinutesIso(NOW, 5),
        title: "Standup",
      },
    ];
    await renderScreen(<Board />, await createTestRuntime());
    expect(await screen.findByLabelText("From your calendar")).toBeOnTheScreen();
    await act(async () => {
      await setSeriesRule({ rule: "skip", series: "cal-1:Standup", title: "Standup" });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("From your calendar")).toBeNull();
    });
  });

  it("keeps the calendar card when its skip did not go through, and says so", async () => {
    seminarSoon();
    const skip = heldRoute();
    await renderScreen(
      <Board />,
      await createTestRuntime({ routes: { "POST /api/calendar/skip": skip.route } }),
    );
    const card = await screen.findByLabelText("From your calendar");
    await fireEvent.press(within(card).getByRole("button", { name: "Skip" }));
    await waitFor(() => {
      expect(skip.waiting()).toBe(1);
    });
    await act(async () => {
      skip.refuse();
      await Promise.resolve();
    });
    expect(await screen.findByText(en("notifications.failedAction"))).toBeOnTheScreen();
    expect(screen.getByLabelText("From your calendar")).toBeOnTheScreen();
  });

  describe("the time bar on Now", () => {
    it("shows the activity input while nothing runs", async () => {
      await renderScreen(<Board />, await createTestRuntime());
      expect(screen.getByLabelText(en("time.bar"))).toBeOnTheScreen();
      expect(screen.getByLabelText(en("time.whatDoing"))).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: /^Stop/u })).toBeNull();
    });

    it("shows the activity and time it has run; Stop stops it", async () => {
      const runtime = await walkSince(25);
      await renderScreen(<Board />, runtime);
      const bar = screen.getByLabelText(en("time.bar"));
      expect(within(bar).getByText("Walk")).toBeOnTheScreen();
      expect(within(bar).getByText("25m")).toBeOnTheScreen();
      await fireEvent.press(within(bar).getByRole("button", { name: "Stop: Walk" }));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Stop: Walk" })).toBeNull();
      });
      expect(
        Object.values(runtime.state.store.getState().time.activities).filter(
          (activity) => activity.endAt === null,
        ),
      ).toEqual([]);
    });

    it("opens each bar button's picker from Now, and a pick starts it", async () => {
      const runtime = await createTestRuntime();
      await renderScreen(<Board />, runtime);
      const bar = () => screen.getByLabelText(en("time.bar"));
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
      expect(within(bar()).getByText("Short break")).toBeOnTheScreen();
      expect(runtime.state.store.getState().time.activities).not.toEqual({});
    });

    it("keeps task rows in their native box with the time bar present", async () => {
      await renderScreen(<Board />, await walkSince(5));
      expect(screen.getByLabelText(en("time.bar"))).toBeOnTheScreen();
      expect(checks().length).toBeGreaterThan(0);
      expect(rowsInFlattenableBoxes()).toEqual([]);
      expect(controlsInsideControls()).toEqual([]);
    });
  });

  it("shows the empty state on a fresh account", async () => {
    await renderScreen(<Board />, await createTestRuntime({ world: "empty" }));
    expect(screen.getByText(en("now.empty"))).toBeOnTheScreen();
  });
});
