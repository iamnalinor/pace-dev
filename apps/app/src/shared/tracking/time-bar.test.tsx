import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Calendar from "expo-calendar";

import type { PaceRuntime } from "#app/runtime.ts";
import type { FakeCalendar } from "#app/testing/calendar.fake.ts";

import * as phoneCalendar from "#app/platform/phone-calendar.ts";
import { controlsInsideControls } from "#app/test/nested-controls.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { problem } from "@pace/client/testing";
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

/** A promise the test settles when it wants to. */
const deferred = <T,>() => {
  const settle: { resolve: (value: T) => void } = { resolve: () => undefined };
  const promise = new Promise<T>((resolve) => {
    settle.resolve = resolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      settle.resolve(value);
    },
  };
};

beforeEach(() => {
  calendar.state.status = "undetermined";
  calendar.state.events = [];
});

/** The assistant's reading of "Пошел в ЦСС, 20мин" from the activity field. */
const CSS_READ = {
  confidence: 1,
  domain: "activity",
  actions: [
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
    expect(controlsInsideControls()).toEqual([]);
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

  it.each([
    { button: "Calendar", choice: "Seminar", list: en("time.calendarToday") },
    { button: "Chores", choice: "Getting ready", list: "Chores" },
    { button: "Rest", choice: "Walk", list: "Rest" },
    { button: "Task", choice: "Algebra HW 6", list: "Task" },
  ])(
    "marks the running choice in $button's picker, and only closes it when that is picked again",
    async ({ button, choice, list }) => {
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
      const runtime = await createTestRuntime();
      await renderScreen(<TimeBar />, runtime);
      await fireEvent.press(screen.getByRole("button", { name: button }));
      await fireEvent.press(within(await picker(list)).getByRole("button", { name: choice }));
      const on = en("time.buttonRunning", { label: button });
      await waitFor(() => {
        expect(screen.getByRole("button", { name: on })).toBeOnTheScreen();
      });
      const before = activities(runtime);
      const events = runtime.state.store.getState().log.length;
      const starts = [
        jest.spyOn(runtime.actions, "startChoice"),
        jest.spyOn(runtime.actions, "focusTask"),
        jest.spyOn(runtime.actions, "startCalendar"),
      ];
      await fireEvent.press(screen.getByRole("button", { name: on }));
      // The running one is marked: checked, and named so a screen reader hears it too.
      const again = within(await picker(list)).getByRole("button", {
        name: en("time.buttonRunning", { label: choice }),
      });
      await fireEvent.press(again);
      await waitFor(() => {
        expect(listsNamed(list)).toEqual([]);
      });
      // Nothing asked of the actions, nothing written: the same block runs on.
      for (const start of starts) {
        expect(start).not.toHaveBeenCalled();
      }
      expect(activities(runtime)).toEqual(before);
      expect(runtime.state.store.getState().log).toHaveLength(events);
    },
  );

  describe("while an answer is pending (class 3)", () => {
    it("opens only the picker asked for last: a calendar read that answers late opens nothing", async () => {
      await renderScreen(<TimeBar />, await createTestRuntime());
      const button = screen.getByRole("button", { name: "Calendar" });
      await waitFor(() => {
        expect(button.props["accessibilityHint"]).toBe(en("time.calendar.noAccess"));
      });
      // Greyed, a tap reads the calendar again: that read hangs until the test answers it.
      const read = deferred<"granted">();
      jest.spyOn(phoneCalendar, "calendarAccess").mockReturnValueOnce(read.promise);
      await fireEvent.press(button);
      await fireEvent.press(screen.getByRole("button", { name: "Rest" }));
      await picker("Rest");
      calendar.state.status = "granted";
      read.resolve("granted");
      // The late answer has landed once the button reads it (access, nothing near)...
      await waitFor(() => {
        expect(button.props["accessibilityHint"]).toBe(en("time.calendar.nothingNear"));
      });
      // ...and the Rest picker stays: Calendar's late answer opens nothing over it.
      expect(listsNamed("Rest")).toHaveLength(1);
      expect(screen.queryByRole("button", { name: en("time.calendarStartUntitled") })).toBeNull();
      expect(
        screen.getAllByRole("header").map((header): unknown => header.props["children"]),
      ).toEqual(["Rest"]);
    });

    it("keeps the picker as it was while a pick is written: no Stop flashes in before it closes", async () => {
      const runtime = await createTestRuntime();
      await renderScreen(<TimeBar />, runtime);
      const release = deferred<undefined>();
      const original = runtime.actions.startChoice;
      jest.spyOn(runtime.actions, "startChoice").mockImplementation(async (...args) => {
        const result = await original(...args);
        await release.promise;
        return result;
      });
      await fireEvent.press(screen.getByRole("button", { name: "Rest" }));
      await fireEvent.press(within(await picker("Rest")).getByRole("button", { name: "Walk" }));
      // Written: the bar shows it on, but the picker, still closing, is the one that was tapped.
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: en("time.buttonRunning", { label: "Rest" }) }),
        ).toBeOnTheScreen();
      });
      expect(listsNamed("Rest")).toHaveLength(1);
      expect(screen.queryByRole("button", { name: en("time.stop") })).toBeNull();
      release.resolve(undefined);
      await waitFor(() => {
        expect(listsNamed("Rest")).toEqual([]);
      });
    });

    it("lets go of the picker as it was when the pick is refused", async () => {
      const runtime = await createTestRuntime();
      await renderScreen(<TimeBar />, runtime);
      jest
        .spyOn(runtime.actions, "startChoice")
        .mockResolvedValue({ error: "action/nothing-to-do", ok: false });
      await fireEvent.press(screen.getByRole("button", { name: "Rest" }));
      await fireEvent.press(within(await picker("Rest")).getByRole("button", { name: "Walk" }));
      // Refused: the picker stays open for another pick, and the next one goes through.
      expect(await screen.findByText(en("actionError.action/nothing-to-do"))).toBeOnTheScreen();
      expect(listsNamed("Rest")).toHaveLength(1);
      jest.restoreAllMocks();
      await fireEvent.press(within(await picker("Rest")).getByRole("button", { name: "Nap" }));
      await waitFor(() => {
        expect(running(runtime)).toEqual(["Nap"]);
      });
    });
  });

  it("offers no alongside switch when nothing else runs", async () => {
    await renderScreen(<TimeBar />, await createTestRuntime());
    await fireEvent.press(screen.getByRole("button", { name: "Rest" }));
    await picker("Rest");
    expect(screen.queryByLabelText("Alongside what is running")).toBeNull();
  });

  it("reviews the assistant's activity before starting it", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "POST /api/parse": () => CSS_READ,
      },
    });
    await renderScreen(<TimeBar />, runtime);
    const field = screen.getByLabelText("What are you doing?");
    await fireEvent.changeText(field, "Пошел в ЦСС, 20мин");
    await fireEvent(field, "submitEditing");
    expect(activities(runtime)).toEqual([]);
    expect(await screen.findByText("Start: ЦСС")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(activities(runtime)).toEqual([
        expect.objectContaining({ category: "sport", expectMinutes: 20, label: "ЦСС" }),
      ]);
    });
    expect(field).toHaveDisplayValue("");
  });

  it("says the thread is full on a sixth correction instead of dropping it", async () => {
    const parse = jest.fn(() => CSS_READ);
    const runtime = await createTestRuntime({ routes: { "POST /api/parse": parse } });
    await renderScreen(<TimeBar />, runtime);
    const field = screen.getByLabelText("What are you doing?");
    await fireEvent.changeText(field, "Пошел в ЦСС, 20мин");
    await fireEvent(field, "submitEditing");
    expect(await screen.findByText("Start: ЦСС")).toBeOnTheScreen();
    for (let round = 1; round <= 5; round += 1) {
      await fireEvent.changeText(
        screen.getByLabelText(en("assistant.correct")),
        `ещё ${String(round)}`,
      );
      await fireEvent(screen.getByLabelText(en("assistant.correct")), "submitEditing");
      await waitFor(() => {
        expect(parse).toHaveBeenCalledTimes(round + 1);
      });
    }
    await fireEvent.changeText(screen.getByLabelText(en("assistant.correct")), "ещё 6");
    await fireEvent(screen.getByLabelText(en("assistant.correct")), "submitEditing");
    expect(await screen.findByText(en("assistant.tooManyCorrections"))).toBeOnTheScreen();
    expect(parse).toHaveBeenCalledTimes(6);
  });

  it("discards a stale activity preview after editing the source text", async () => {
    const runtime = await createTestRuntime({ routes: { "POST /api/parse": () => CSS_READ } });
    await renderScreen(<TimeBar />, runtime);
    const field = screen.getByLabelText("What are you doing?");
    await fireEvent.changeText(field, "Пошел в ЦСС, 20мин");
    await fireEvent(field, "submitEditing");
    expect(await screen.findByText("Start: ЦСС")).toBeOnTheScreen();
    await fireEvent.changeText(field, "Пошел в ЦСС, 30мин");
    expect(screen.queryByText("Start: ЦСС")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(activities(runtime)).toEqual([]);
  });

  it("ignores an assistant response for activity text edited while reading", async () => {
    const answer = deferred<unknown>();
    const runtime = await createTestRuntime({
      routes: { "POST /api/parse": async () => await answer.promise },
    });
    await renderScreen(<TimeBar />, runtime);
    const field = screen.getByLabelText("What are you doing?");
    await fireEvent.changeText(field, "Пошел в ЦСС, 20мин");
    await fireEvent(field, "submitEditing");
    await fireEvent.changeText(field, "Пошел в ЦСС, 30мин");
    answer.resolve(CSS_READ);
    await waitFor(() => {
      expect(screen.queryByText(en("assistant.reading"))).toBeNull();
    });
    expect(screen.queryByText("Start: ЦСС")).toBeNull();
    expect(activities(runtime)).toEqual([]);
  });

  it("shows that the assistant is reading while no activity is written", async () => {
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
    expect(activities(runtime)).toEqual([]);
    expect(screen.getByText(en("assistant.reading"))).toBeOnTheScreen();
    answer.resolve(CSS_READ);
    expect(await screen.findByText("Start: ЦСС")).toBeOnTheScreen();
    expect(screen.queryByText(en("assistant.reading"))).toBeNull();
    expect(activities(runtime)).toEqual([]);
  });

  it("explains a rule fallback and offers Food for «ем» when the request fails", async () => {
    const runtime = await createTestRuntime({
      routes: { "POST /api/parse": () => problem(503, "unavailable") },
    });
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.changeText(screen.getByLabelText("What are you doing?"), "ем");
    await fireEvent.press(screen.getByRole("button", { name: "Review assistant actions" }));
    expect(await screen.findByText(en("assistant.rulesUsed"))).toBeOnTheScreen();
    expect(activities(runtime)).toEqual([]);
    await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(activities(runtime)).toEqual([
        expect.objectContaining({ category: "food", label: "ем" }),
      ]);
    });
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
    expect(on.props["accessibilityHint"]).toBe(en("time.buttonRunningHint"));
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
