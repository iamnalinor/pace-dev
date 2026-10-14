import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Calendar from "expo-calendar";

import type { PaceRuntime } from "#app/runtime.ts";
import type { FakeCalendar } from "#app/testing/calendar.fake.ts";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
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

const BUTTONS = ["Calendar", "Task", "Chores", "Rest"];

/** The bar's four buttons, by their accessible names, in the order they stand. */
const barButtons = (): readonly string[] =>
  within(screen.getByLabelText("Time"))
    .getAllByRole("button")
    .map((button): string => String(button.props["accessibilityLabel"]))
    .filter((label) => BUTTONS.some((name) => label.startsWith(name)));

/** The lists named so: a list is no accessibility element of its own, so it is found by its name. */
const listsNamed = (name: string) =>
  screen.queryAllByLabelText(name).filter((element) => element.props["role"] === "list");

/** The picker a button opened: its list of choices, named after the button. */
const picker = async (name: string) =>
  await waitFor(() => {
    const [list] = listsNamed(name);
    if (list === undefined) {
      throw new Error(`no picker named ${name}`);
    }
    return list;
  });

const choicesIn = async (name: string): Promise<readonly string[]> =>
  within(await picker(name))
    .getAllByRole("button")
    .map((button): string => String(button.props["accessibilityLabel"]));

beforeEach(() => {
  calendar.state.status = "undetermined";
  calendar.state.events = [];
});

/** The assistant's reading of "Пошел в ЦСС, 20мин" from the activity field. */
const CSS_READ = {
  confidence: 1,
  domain: "activity",
  proposals: [
    {
      category: "sport",
      expectMinutes: 20,
      kind: "activity.start",
      label: "ЦСС",
      summary: "Start: ЦСС",
    },
  ],
  provider: "fake",
  status: "parsed",
};

describe("TimeBar", () => {
  it("has Calendar, Task, Chores and Rest in this order, with no «⋯» and no switches", async () => {
    await renderScreen(<TimeBar />, await createTestRuntime());
    expect(barButtons()).toEqual(BUTTONS);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: /More about/u })).toBeNull();
  });

  it("opens Rest's picker on a tap: six ways to rest; a pick starts it, a tap again offers Stop", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: "Rest" }));
    expect(await choicesIn("Rest")).toEqual([
      "Short break",
      "Rest",
      "Walk",
      "Workout",
      "Nap",
      "Sleep",
    ]);
    // Nothing starts on the tap itself, and nothing runs, so there is nothing to stop.
    expect(running(runtime)).toEqual([]);
    expect(screen.queryByRole("button", { name: en("time.stop") })).toBeNull();
    await fireEvent.press(within(await picker("Rest")).getByRole("button", { name: "Workout" }));
    await waitFor(() => {
      expect(activities(runtime)).toEqual([
        expect.objectContaining({ category: "sport", expectMinutes: 60, label: "Workout" }),
      ]);
    });
    expect(listsNamed("Rest")).toEqual([]);

    const on = screen.getByRole("button", { name: en("time.buttonRunning", { label: "Rest" }) });
    await fireEvent.press(on);
    await fireEvent.press(await screen.findByRole("button", { name: en("time.stop") }));
    await waitFor(() => {
      expect(running(runtime)).toEqual([]);
    });
    expect(listsNamed("Rest")).toEqual([]);
  });

  it("picks a chore from Chores' picker, which has no nap any more", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: "Chores" }));
    const chores = await choicesIn("Chores");
    expect(chores).toContain("Getting ready");
    expect(chores).not.toContain("Nap");
    await fireEvent.press(screen.getByRole("button", { name: "Getting ready" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Getting ready"]);
    });
  });

  it("lists open tasks in Task's picker, narrows them as typed, and starts Focus on the one picked", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: "Task" }));
    const all = await choicesIn("Task");
    expect(all).toContain("Algebra HW 6");
    expect(all).toContain("Calculus HW 6");
    await fireEvent.changeText(screen.getByLabelText(en("time.taskSearch")), "calc 6");
    await waitFor(async () => {
      expect(await choicesIn("Task")).toEqual(["Calculus HW 6"]);
    });
    await fireEvent.press(screen.getByRole("button", { name: "Calculus HW 6" }));
    await waitFor(() => {
      expect(activities(runtime)).toEqual([
        expect.objectContaining({ category: "task", label: "Calculus HW 6" }),
      ]);
    });
    expect(
      screen.getByRole("button", { name: en("time.buttonRunning", { label: "Task" }) }),
    ).toBeOnTheScreen();
  });

  it("says so when no open task matches what is typed", async () => {
    await renderScreen(<TimeBar />, await createTestRuntime());
    await fireEvent.press(screen.getByRole("button", { name: "Task" }));
    await fireEvent.changeText(await screen.findByLabelText(en("time.taskSearch")), "zzzz");
    expect(await screen.findByText(en("time.taskNoMatch"))).toBeOnTheScreen();
  });

  it("runs a workout alongside what is running, from the switch in the picker's header", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: "Chores" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Commute" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Commute"]);
    });
    await fireEvent.press(screen.getByRole("button", { name: "Rest" }));
    await fireEvent(await screen.findByLabelText("Alongside what is running"), "valueChange", true);
    await fireEvent.press(screen.getByRole("button", { name: "Workout" }));
    await waitFor(() => {
      expect(running(runtime).toSorted((a, b) => a.localeCompare(b))).toEqual([
        "Commute",
        "Workout",
      ]);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Stop: Workout" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Commute"]);
    });
  });

  it("offers no alongside switch when nothing else runs", async () => {
    await renderScreen(<TimeBar />, await createTestRuntime());
    await fireEvent.press(screen.getByRole("button", { name: "Rest" }));
    await picker("Rest");
    expect(screen.queryByLabelText("Alongside what is running")).toBeNull();
  });

  it("starts what is typed at once with its length, then takes the assistant's name for it", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "POST /api/parse": () => CSS_READ,
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

  it("shows the typed words as a draft while the assistant reads them", async () => {
    const answer: { resolve: (value: unknown) => void } = { resolve: () => undefined };
    const runtime = await createTestRuntime({
      routes: {
        "POST /api/parse": async () =>
          await new Promise((resolve) => {
            answer.resolve = resolve;
          }),
      },
    });
    await renderScreen(<TimeBar />, runtime);
    const field = screen.getByLabelText("What are you doing?");
    await fireEvent.changeText(field, "Пошел в ЦСС, 20мин");
    await fireEvent(field, "submitEditing");
    // Outlined, not a category's colored tag: it is still being read.
    expect(
      await screen.findByLabelText(en("time.draft", { label: "Пошел в ЦСС" })),
    ).toBeOnTheScreen();
    answer.resolve(CSS_READ);
    await waitFor(() => {
      expect(screen.queryByLabelText(en("time.draft", { label: "Пошел в ЦСС" }))).toBeNull();
    });
    expect(screen.getByText("ЦСС")).toBeOnTheScreen();
  });

  it("is greyed without calendar access; a tap opens its picker, which says why and leads to the permissions", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    const button = screen.getByRole("button", { name: "Calendar" });
    await waitFor(() => {
      expect(button.props["accessibilityHint"]).toBe(en("time.calendar.noAccess"));
    });
    await fireEvent(button, "touchEnd");
    await fireEvent.press(button);
    expect(await screen.findByText(en("phone.calendarAsk"))).toBeOnTheScreen();
    // The sheet explains it: no bubble left behind over the dim.
    expect(screen.queryByText(en("time.calendar.noAccess"))).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("permissions.title") }));
    expect(router.push).toHaveBeenCalledWith("/permissions");
    expect(running(runtime)).toEqual([]);
  });

  it("reads the calendar again on a tap: access granted since then lists today's events", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    const button = screen.getByRole("button", { name: "Calendar" });
    await waitFor(() => {
      expect(button.props["accessibilityHint"]).toBe(en("time.calendar.noAccess"));
    });
    calendar.state.status = "granted";
    calendar.state.events = [
      {
        allDay: false,
        endDate: addMinutesIso(NOW, 50),
        id: "e1",
        startDate: addMinutesIso(NOW, -10),
        title: "Seminar",
      },
    ];
    await fireEvent.press(button);
    await fireEvent.press(await screen.findByRole("button", { name: "Seminar" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Seminar"]);
    });
  });

  it("is greyed with nothing in the calendar within 15 minutes of now, and its picker still lists the day", async () => {
    calendar.state.status = "granted";
    calendar.state.events = [
      {
        allDay: false,
        endDate: addMinutesIso(NOW, 90),
        id: "ev-later",
        startDate: addMinutesIso(NOW, 40),
        title: "Later",
      },
    ];
    await renderScreen(<TimeBar />, await createTestRuntime());
    const button = screen.getByRole("button", { name: "Calendar" });
    await waitFor(() => {
      expect(button.props["accessibilityHint"]).toBe(en("time.calendar.nothingNear"));
    });
    await fireEvent.press(button);
    expect(await choicesIn(en("time.calendarToday"))).toEqual(["Later"]);
  });

  it("opens the picker even with one event near now: the event starts from its start when picked", async () => {
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
    const button = screen.getByRole("button", { name: "Calendar" });
    await waitFor(() => {
      expect(button.props["accessibilityHint"]).toBe(en("time.buttonHint"));
    });
    await fireEvent.press(button);
    expect(running(runtime)).toEqual([]);
    await fireEvent.press(await screen.findByRole("button", { name: "Алгебра, семинар" }));
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

  it("starts a meeting without an event from Calendar's picker when the calendar has nothing on", async () => {
    calendar.state.status = "granted";
    calendar.state.events = [];
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: "Calendar" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: en("time.calendarStartUntitled") }),
    );
    await waitFor(() => {
      expect(running(runtime)).toEqual([en("time.calendarUntitled")]);
    });
    // Its own activity runs: on, not greyed, and its picker offers Stop first.
    const on = screen.getByRole("button", {
      name: en("time.buttonRunning", { label: "Calendar" }),
    });
    expect(on.props["accessibilityHint"]).toBe(en("time.buttonHint"));
    await fireEvent.press(on);
    await fireEvent.press(await screen.findByRole("button", { name: en("time.stop") }));
    await waitFor(() => {
      expect(running(runtime)).toEqual([]);
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
