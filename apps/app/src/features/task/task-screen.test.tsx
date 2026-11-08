import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, HW_VIEW_NOW, RENT_ID, rentSeriesEvents, TRK_ID, TRK_NOW } from "@pace/core/testing";

import { TaskScreen } from "./task-screen.tsx";

beforeEach(() => {
  jest.clearAllMocks();
});

// jest renders the phone, where Space is no key; the web's handler is the one under test here.
jest.mock("#app/ui/space-press.ts", (): unknown =>
  jest.requireActual("#app/ui/space-press.web.ts"),
);

/**
A Space key press on a control, as react-native-web passes it to the handler. The browser delivers
keys to a disabled control it has focus on; RNTL's `fireEvent` would drop them, so the handler is
called as the browser does.
*/
const pressSpace = async (control: ReturnType<typeof screen.getByRole>): Promise<void> => {
  const target = {};
  await act(() => {
    (control.props["onKeyDown"] as (event: unknown) => void)({
      currentTarget: target,
      key: " ",
      preventDefault: () => undefined,
      target,
    });
  });
};

const hwScreen = async () => {
  const runtime = await createTestRuntime({ now: HW_VIEW_NOW });
  await renderScreen(<TaskScreen id={HW_ID} />, runtime);
  return runtime;
};

describe("TaskScreen — homework", () => {
  it("shows the start, the due, the work left and the subtasks with their states", async () => {
    await hwScreen();
    expect(screen.getByRole("header", { name: "Algebra HW 6" })).toBeOnTheScreen();
    expect(screen.getByText("today 23:59")).toBeOnTheScreen();
    expect(screen.getByText("1h 43m")).toBeOnTheScreen();
    expect(screen.getByText(en("task.start"))).toBeOnTheScreen();
    expect(screen.queryByText(/of window gone/u)).toBeNull();
    expect(screen.getByText(en("task.subtasksSummary", { sent: 2, solved: 4 }))).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: "Kronecker–Capelli" })).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: "Matrix rank" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit 3 and 4" })).toBeOnTheScreen();
  });

  it("marks a subtask solved on Space, and leaves a sent one as it is (a disabled control gets no action)", async () => {
    const runtime = await hwScreen();
    const solved = () => screen.getByText(en("task.subtasksSummary", { sent: 2, solved: 4 }));
    expect(solved()).toBeOnTheScreen();
    // Control: Space on a pending subtask is a press.
    await pressSpace(screen.getByRole("checkbox", { name: "Kronecker–Capelli" }));
    await waitFor(() => {
      expect(
        screen.getByText(en("task.subtasksSummary", { sent: 2, solved: 5 })),
      ).toBeOnTheScreen();
    });
    // A sent subtask is disabled: Space must not revoke its mark.
    const unmark = jest.spyOn(runtime.actions, "unmarkSolved");
    const mark = jest.spyOn(runtime.actions, "markSolved");
    await pressSpace(screen.getByRole("checkbox", { name: "Matrix rank" }));
    expect(unmark).not.toHaveBeenCalled();
    expect(mark).not.toHaveBeenCalled();
  });

  it("focuses on the task from the footer and stops again", async () => {
    const runtime = await hwScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Focus" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Focusing" })).toBeOnTheScreen();
    });
    const running = () =>
      Object.values(runtime.state.store.getState().time.activities).filter(
        (activity) => activity.endAt === null,
      );
    expect(running().map((activity) => activity.taskId)).toEqual([HW_ID]);
    await fireEvent.press(screen.getByRole("button", { name: "Focusing" }));
    await waitFor(() => {
      expect(running()).toEqual([]);
    });
  });

  it("reads a button's choice that names the task as that button's, not as Focus", async () => {
    const runtime = await createTestRuntime({ now: HW_VIEW_NOW });
    // The assistant can start a choice on a task: a walk to think the homework over.
    await runtime.actions.startActivity({
      buttonId: "rest:walk",
      category: "rest",
      label: "Walk",
      taskId: HW_ID,
    });
    await renderScreen(<TaskScreen id={HW_ID} />, runtime);
    // The same answer as the time bar's Task button (off) and its picker (no check).
    expect(screen.getByRole("button", { name: "Focus" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Focusing" })).toBeNull();
  });

  it("toggles a subtask solved and back", async () => {
    const runtime = await hwScreen();
    const subtask = screen.getByRole("checkbox", { name: "Kronecker–Capelli" });
    expect(subtask).not.toBeChecked();
    await fireEvent.press(subtask);
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Kronecker–Capelli" })).toBeChecked();
    });
    expect(screen.getByRole("button", { name: "Submit 3, 4 and 5" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Kronecker–Capelli" }));
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Kronecker–Capelli" })).not.toBeChecked();
    });
    const task = runtime.state.store.getState().tasks.byId[HW_ID];
    expect(task?.subtasks.find((item) => item.id === "s5")?.solvedAt).toBeNull();
  });

  it("goes back, and moves the task to another project from the header chip", async () => {
    const runtime = await hwScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Project: Algebra. Change" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "No project" }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[HW_ID]?.projectId).toBeNull();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(router.back).toHaveBeenCalled();
  });
});

/** The rent instance's screen at `now`, its series repeating until `until` (no end by default). */
const rentScreen = async ({
  now,
  until,
}: {
  readonly now?: string;
  readonly until?: string;
} = {}) => {
  const runtime = await createTestRuntime(now === undefined ? {} : { now });
  await runtime.state.ingest(rentSeriesEvents(until));
  await renderScreen(<TaskScreen id={RENT_ID} />, runtime);
  return runtime;
};

/** The details card's figure under `label`, as a screen reader reads it. */
const stat = (label: string) => screen.getByLabelText(label);

describe("TaskScreen — repeats and the final deadline", () => {
  it("says how the series repeats and when its deadline finally ends", async () => {
    await rentScreen();
    expect(stat(en("task.due"))).toHaveAccessibilityValue({ text: "Oct 31 23:59" });
    expect(stat(en("task.repeats"))).toHaveAccessibilityValue({
      text: "Every month on the last day",
    });
    expect(screen.getByText("Every month on the last day")).toBeOnTheScreen();
    expect(stat(en("task.finalDue"))).toHaveAccessibilityValue({ text: "Nov 7 23:59" });
  });

  it("names the task's category among its tags, as its row does (QA 13 L9)", async () => {
    await rentScreen();
    // Rent has no project: before this the screen named no category at all.
    expect(screen.getByText(en("preset.base.personal"))).toBeOnTheScreen();
  });

  it("names a homework week by its due weekday, and neither line on a one-off task", async () => {
    await hwScreen();
    expect(stat(en("task.repeats"))).toHaveAccessibilityValue({ text: "Every Wednesday" });
    // Algebra's second stage has no end: no final deadline to show.
    expect(screen.queryByLabelText(en("task.finalDue"))).toBeNull();
    await screen.unmount();
    await trkScreen();
    expect(screen.queryByLabelText(en("task.repeats"))).toBeNull();
    expect(screen.queryByLabelText(en("task.finalDue"))).toBeNull();
  });

  it("calls the last instance of an ending series the last, and drops the line once it is behind", async () => {
    // No repeat after Oct 15; the instance is due Oct 31.
    await rentScreen({ now: "2026-10-20T12:00:00.000Z", until: "2026-10-15" });
    expect(stat(en("task.repeats"))).toHaveAccessibilityValue({
      text: "Every month on the last day, this one is the last",
    });
    await screen.unmount();
    await rentScreen({ now: "2026-11-02T12:00:00.000Z", until: "2026-10-15" });
    expect(screen.queryByLabelText(en("task.repeats"))).toBeNull();
    // The second stage still runs: the final deadline stays.
    expect(stat(en("task.finalDue"))).toBeOnTheScreen();
  });

  it("speaks Russian on a Russian device", async () => {
    const locale = jest.spyOn(globalThis.navigator, "language", "get").mockReturnValue("ru-RU");
    try {
      await rentScreen();
      expect(stat("Повтор")).toHaveAccessibilityValue({ text: "Каждый месяц, в последний день" });
      expect(stat("Окончательный срок")).toHaveAccessibilityValue({ text: "7 нояб. 23:59" });
    } finally {
      locale.mockRestore();
    }
  });
});

const trkScreen = async () => {
  const runtime = await createTestRuntime({ deviceTz: "UTC", now: TRK_NOW });
  await renderScreen(<TaskScreen id={TRK_ID} />, runtime);
  return runtime;
};

describe("TaskScreen — editing subtasks", () => {
  it("saves a subtask still being typed in the editor", async () => {
    const runtime = await hwScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    await fireEvent.press(screen.getByRole("button", { name: en("form.addSubtask") }));
    await fireEvent.changeText(screen.getByPlaceholderText(en("form.addSubtask")), "Bonus");
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(
        runtime.state.store.getState().tasks.byId[HW_ID]?.subtasks.map((item) => item.label),
      ).toContain("Bonus");
    });
  });

  it("takes an unsent subtask off in the editor; a sent one has no remove", async () => {
    const runtime = await hwScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    expect(
      screen.queryByRole("button", { name: en("form.removeSubtask", { label: "Matrix rank" }) }),
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", {
        name: en("form.removeSubtask", { label: "Kronecker–Capelli" }),
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(
        runtime.state.store.getState().tasks.byId[HW_ID]?.subtasks.map((item) => item.label),
      ).not.toContain("Kronecker–Capelli");
    });
  });
});

const openMenu = async (): Promise<void> => {
  await fireEvent.press(screen.getByRole("button", { name: en("task.menu") }));
};
/** Escape on the web, the system Back on Android: the modal's own close request. */
const requestClose = async (): Promise<void> => {
  await act(() => {
    const modal = screen.getByTestId("overlay-modal", { includeHiddenElements: true });
    (modal.props as { onRequestClose: () => void }).onRequestClose();
  });
};

describe("TaskScreen — work", () => {
  it("shows its link and description, and no ranking card", async () => {
    await trkScreen();
    expect(
      screen.getByRole("link", { name: "https://tracker.example.com/browse/TRK-231 ↗" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("p99 check fails ~1 in 5 runs on the shared runner."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Why it's/u })).toBeNull();
    expect(screen.queryByRole("button", { name: "Waiting" })).toBeNull();
  });

  it("edits the description directly on the task page", async () => {
    const runtime = await trkScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.editDescription") }));
    const input = screen.getByLabelText(en("edit.description"));
    expect(input.props["value"]).toBe("p99 check fails ~1 in 5 runs on the shared runner.");
    await fireEvent.changeText(input, "Investigation notes pasted here");
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.description).toBe(
        "Investigation notes pasted here",
      );
    });
    expect(screen.getByText("Investigation notes pasted here")).toBeOnTheScreen();
  });

  it("opens a link in the description without starting to edit; a tap on its words still edits (feedback 5 item 8)", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC", now: TRK_NOW });
    await runtime.actions.updateTask(TRK_ID, {
      description: "Logs: https://ci.example.com/run/42 and www.example.org/a, see them.",
    });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await renderScreen(<TaskScreen id={TRK_ID} />, runtime);
    const link = screen.getByRole("link", { name: "https://ci.example.com/run/42" });
    await fireEvent.press(link);
    expect(open).toHaveBeenCalledWith("https://ci.example.com/run/42");
    expect(screen.queryByLabelText(en("edit.description"))).toBeNull();
    await fireEvent.press(screen.getByRole("link", { name: "www.example.org/a" }));
    expect(open).toHaveBeenCalledWith("https://www.example.org/a");
    expect(screen.queryByLabelText(en("edit.description"))).toBeNull();
    // The words are the person's, unchanged; a tap on them opens the editor with all of it.
    await fireEvent.press(screen.getByText(/, see them\./u));
    expect(screen.getByLabelText(en("edit.description")).props["value"]).toBe(
      "Logs: https://ci.example.com/run/42 and www.example.org/a, see them.",
    );
    // No link sits inside a button (bug-lessons 14, 132).
    expect(screen.queryByRole("button", { name: en("task.editDescription") })).toBeNull();
    open.mockRestore();
  });

  it("keeps a description being edited through a reload, and drops it on Cancel (feedback 5 item 7)", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC", now: TRK_NOW });
    jest.spyOn(runtime.api, "currentSessionToken").mockReturnValue("session-1");
    const page = await renderScreen(<TaskScreen id={TRK_ID} />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("task.editDescription") }));
    await fireEvent.changeText(screen.getByLabelText(en("edit.description")), "Half-written");
    await page.unmount();
    const again = await renderScreen(<TaskScreen id={TRK_ID} />, runtime);
    expect(screen.getByLabelText(en("edit.description")).props["value"]).toBe("Half-written");
    await fireEvent.press(screen.getByRole("button", { name: en("common.cancel") }));
    await again.unmount();
    await renderScreen(<TaskScreen id={TRK_ID} />, runtime);
    expect(screen.queryByLabelText(en("edit.description"))).toBeNull();
    expect(
      screen.getByText("p99 check fails ~1 in 5 runs on the shared runner."),
    ).toBeOnTheScreen();
  });

  it("offers to add a description on a task with none", async () => {
    await hwScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.addDescription") }));
    expect(screen.getByLabelText(en("edit.description"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("common.cancel") }));
    expect(screen.getByRole("button", { name: en("task.addDescription") })).toBeOnTheScreen();
  });

  it("moves the progress slider in percent, the work left following at once", async () => {
    const runtime = await trkScreen();
    expect(screen.getByText("40\u{A0}%")).toBeOnTheScreen();
    const workLeft = (): string => {
      const value = screen.getByLabelText(en("task.workLeft")).props["accessibilityValue"] as
        | undefined
        | { readonly text?: string };
      return value?.text ?? "";
    };
    const before = workLeft();
    await fireEvent(
      screen.getByRole("adjustable", { name: en("task.progressAria") }),
      "accessibilityAction",
      {
        nativeEvent: { actionName: "increment" },
      },
    );
    // Shown before the store answers: the thumb never jumps back to where it was.
    expect(screen.getByText("50\u{A0}%")).toBeOnTheScreen();
    expect(workLeft()).not.toBe(before);
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.slider).toBe(5);
    });
    expect(screen.getByText("50\u{A0}%")).toBeOnTheScreen();
    // The readout a screen reader hears is the percent, not the step (F-A11Y-16).
    expect(
      screen.getByRole("adjustable", { name: en("task.progressAria") }).props["accessibilityValue"],
    ).toMatchObject({ text: "50\u{A0}%" });
    // No Pause in the header (Q4): the status is not a header control.
    expect(screen.queryByRole("button", { name: /^Pause$/u })).toBeNull();
  });

  it("edits the title from the header's pencil", async () => {
    const runtime = await trkScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    const title = screen.getByLabelText(en("edit.taskTitle"));
    await fireEvent.changeText(title, "Flaky p99 test");
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.title).toBe("Flaky p99 test");
    });
  });

  it("edits everything from the pencil: clears the due and sets an estimate", async () => {
    const runtime = await trkScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    await fireEvent.press(screen.getByRole("button", { name: /^Due: /u }));
    await fireEvent.press(screen.getByRole("button", { name: en("composer.clear") }));
    await fireEvent.press(screen.getByRole("button", { name: /^Estimate: /u }));
    await fireEvent.press(screen.getByRole("radio", { name: "1h 30m" }));
    await fireEvent.press(screen.getByRole("radio", { name: en("importance.asap") }));
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]).toMatchObject({
        dueAt: null,
        estimateMinutes: 90,
        importance: "asap",
      });
    });
  });

  it("keeps Save off while the last repeat date is before the start, and writes nothing (bug class 32)", async () => {
    const runtime = await trkScreen();
    const eventsBefore = runtime.state.store.getState().events.length;
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    await fireEvent.changeText(screen.getByLabelText(en("edit.taskTitle")), "Renamed");
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.daily") }));
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.endDate") }));
    // The task starts on Monday, October 5: a last repeat on the 1st is before it.
    await fireEvent.press(screen.getByRole("button", { name: "Thursday, October 1" }));
    expect(screen.getByRole("button", { name: en("common.save") })).toBeDisabled();
    // The refusal is named next to the field it is about.
    expect(screen.getByText(en("form.repeat.untilBeforeStart"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    expect(runtime.state.store.getState().events).toHaveLength(eventsBefore);
    expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.title).not.toBe("Renamed");
  });

  it("keeps Save off when the due is cleared under a two-stage deadline", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC", now: TRK_NOW });
    await runtime.actions.setOverrides(TRK_ID, {
      deadlinePolicy: {
        finalAt: "2026-10-20T18:00:00.000Z",
        finalMode: "fixed",
        finalTz: "UTC",
        kind: "resubmission",
        softDays: 2,
      },
    });
    await renderScreen(<TaskScreen id={TRK_ID} />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    expect(screen.getByRole("button", { name: en("common.save") })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: /^Due: /u }));
    await fireEvent.press(screen.getByRole("button", { name: en("composer.clear") }));
    expect(screen.getByRole("button", { name: en("common.save") })).toBeDisabled();
  });

  it("will not repeat a task whose deadline is before its start, and says so at Repeat (QA 13 L7)", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC", now: TRK_NOW });
    const result = await runtime.actions.createTask({
      dueAt: "2026-10-01T18:00:00.000Z",
      presetId: "personal",
      startAt: "2026-10-05T09:00:00.000Z",
      title: "Late already",
    });
    const created = result.ok ? result.value[0] : undefined;
    const taskId = created?.type === "task.created" ? created.payload.taskId : "";
    await renderScreen(<TaskScreen id={taskId} />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.daily") }));
    // The start was chosen: the message names it, and is announced (QA 14 L5).
    expect(screen.getByRole("alert")).toHaveTextContent(en("form.repeat.dueBeforeStart"));
    expect(screen.getByRole("button", { name: en("common.save") })).toBeDisabled();
  });

  it("tells a task with no start of its own that its deadline passed, not about a start (QA 14 L3)", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC", now: TRK_NOW });
    const result = await runtime.actions.createTask({
      dueAt: "2026-10-01T18:00:00.000Z",
      presetId: "personal",
      title: "Both past",
    });
    const created = result.ok ? result.value[0] : undefined;
    const taskId = created?.type === "task.created" ? created.payload.taskId : "";
    await renderScreen(<TaskScreen id={taskId} />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.daily") }));
    expect(screen.getByRole("alert")).toHaveTextContent(en("form.repeat.duePassed"));
    expect(screen.queryByText(en("form.repeat.dueBeforeStart"))).toBeNull();
    // A one-off late task is fine: no note about a start nobody chose (QA 14 L7).
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.none") }));
    expect(screen.queryByText(en("form.dueBeforeStartNote"))).toBeNull();
  });

  it("notes, without blocking, a plain task whose chosen start is after its deadline (QA 14 L7)", async () => {
    const runtime = await createTestRuntime({ deviceTz: "UTC", now: TRK_NOW });
    const result = await runtime.actions.createTask({
      dueAt: "2026-10-12T18:00:00.000Z",
      presetId: "personal",
      startAt: "2026-10-14T09:00:00.000Z",
      title: "Starts after due",
    });
    const created = result.ok ? result.value[0] : undefined;
    const taskId = created?.type === "task.created" ? created.payload.taskId : "";
    await renderScreen(<TaskScreen id={taskId} />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    expect(screen.getByText(en("form.dueBeforeStartNote"))).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: en("common.save") })).toBeEnabled();
  });

  it("opens the final date's calendar under its label, and keeps quiet while it is open (QA 13 L8)", async () => {
    await trkScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    await fireEvent.press(screen.getByRole("radio", { name: en("form.deadlineTwoStage") }));
    await fireEvent.press(screen.getByRole("radio", { name: en("form.finalOnDate") }));
    expect(screen.getByText(en("form.final"))).toBeOnTheScreen();
    expect(screen.getByText(en("form.finalTime"))).toBeOnTheScreen();
    expect(screen.queryByRole("alert")).toBeNull();
    // Closed without a date: now the form says what is missing, with the main due date it knows
    // (QA 14 L4), and announces it.
    await fireEvent.press(screen.getByRole("button", { name: /^Final deadline: /u }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      en("form.finalAfterDue", { due: "tomorrow 18:00" }),
    );
  });

  it("shows the last repeat date in words, not as yyyy-MM-dd", async () => {
    await trkScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.daily") }));
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.endDate") }));
    await fireEvent.press(screen.getByRole("button", { name: "Saturday, October 31" }));
    expect(screen.queryByText("2026-10-31")).toBeNull();
    expect(screen.getByRole("radio", { name: /Oct 31/u })).toBeOnTheScreen();
  });

  it("keeps the task it was ended from when Repeat is set to none", async () => {
    const runtime = await trkScreen();
    await runtime.actions.startSeriesForTask(TRK_ID, { kind: "daily" });
    await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.none") }));
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      const seriesId = Object.keys(runtime.state.store.getState().series.byId)[0] ?? "";
      expect(runtime.state.store.getState().series.byId[seriesId]).toMatchObject({
        archived: true,
        keepTaskId: TRK_ID,
      });
    });
  });

  it("repeats again after the repeat was stopped: a new series, with the final deadline (QA 13 H1)", async () => {
    const runtime = await trkScreen();
    const series = () => Object.values(runtime.state.store.getState().series.byId);
    const edit = async () => {
      await fireEvent.press(screen.getByRole("button", { name: en("task.edit") }));
    };
    const save = async () => {
      await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    };
    await edit();
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.weekly") }));
    await save();
    await waitFor(() => {
      expect(series()).toHaveLength(1);
    });
    await edit();
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.none") }));
    await save();
    await waitFor(() => {
      expect(series()[0]?.archived).toBe(true);
    });
    expect(screen.queryByLabelText(en("task.repeats"))).toBeNull();
    // The editor agrees with the screen: the task no longer repeats.
    await edit();
    expect(screen.getByRole("radio", { name: en("form.repeat.none") })).toBeChecked();
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.weekdays") }));
    await fireEvent.press(screen.getByRole("radio", { name: en("form.deadlineTwoStage") }));
    await save();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: en("common.save") })).toBeNull();
    });
    const active = series().find((entry) => !entry.archived);
    expect(active?.schedule).toEqual({ kind: "weekdays" });
    expect(active?.template.overrides).toMatchObject({ deadlinePolicy: { kind: "resubmission" } });
    expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.seriesId).toBe(active?.id);
    expect(stat(en("task.repeats"))).toHaveAccessibilityValue({ text: "Every weekday (Mon–Fri)" });
    expect(stat(en("task.finalDue"))).toBeOnTheScreen();
  });

  it("closes otherwise from the ⋯ menu: the close sheet opens on Cancelled · Skipped", async () => {
    await trkScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.menu") }));
    await fireEvent.press(await screen.findByRole("button", { name: en("task.closeAs") }));
    expect(screen.getByRole("radio", { name: en("close.skipped") })).toBeOnTheScreen();
  });

  describe("deleting", () => {
    it("asks first, in place; Escape cancels the question and keeps the menu (F-A11Y-02)", async () => {
      const runtime = await trkScreen();
      await openMenu();
      await fireEvent.press(await screen.findByRole("button", { name: en("task.delete") }));
      expect(screen.getByText(en("task.deleteAsk"))).toBeOnTheScreen();
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]).toBeDefined();
      await requestClose();
      expect(screen.queryByText(en("task.deleteAsk"))).toBeNull();
      expect(screen.getByRole("button", { name: en("task.delete") })).toBeOnTheScreen();
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]).toBeDefined();
    });

    it("Cancel keeps the task; Delete removes it, goes back, and Undo brings it back", async () => {
      const runtime = await trkScreen();
      await openMenu();
      await fireEvent.press(await screen.findByRole("button", { name: en("task.delete") }));
      await fireEvent.press(screen.getByRole("button", { name: en("common.cancel") }));
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]).toBeDefined();
      await fireEvent.press(screen.getByRole("button", { name: en("task.delete") }));
      await fireEvent.press(screen.getByRole("button", { name: en("common.delete") }));
      await waitFor(() => {
        expect(runtime.state.store.getState().tasks.byId[TRK_ID]).toBeUndefined();
      });
      expect(router.back).toHaveBeenCalled();
      await fireEvent.press(await screen.findByRole("button", { name: en("common.undo") }));
      await waitFor(() => {
        expect(runtime.state.store.getState().tasks.byId[TRK_ID]).toBeDefined();
      });
    });
  });

  it("finishes in one tap on Done; a long press opens the sheet for another time", async () => {
    const runtime = await trkScreen();
    await fireEvent(screen.getByRole("button", { name: en("task.done") }), "longPress");
    expect(screen.getByText(en("close.whenDone"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("common.close") }));
    await fireEvent.press(screen.getByRole("button", { name: en("task.done") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.closed).toMatchObject({
        outcome: "done",
      });
    });
    await fireEvent.press(await screen.findByRole("button", { name: en("common.undo") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.closed).toBeNull();
    });
  });

  it("opens the sheet for another time without a long press, from the button beside Done (QA 19 M2)", async () => {
    await trkScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.doneOther") }));
    expect(screen.getByText(en("close.whenDone"))).toBeOnTheScreen();
    // In its Done mode, with Cancelled and Skipped in sight as choices of the outcome.
    expect(screen.getByRole("button", { name: en("common.done") })).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: en("close.cancelled") })).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: en("close.skipped") })).toBeOnTheScreen();
  });

  it("tells readers once what Done does (round 6 M5, QA round 20 L3)", async () => {
    await trkScreen();
    const done = screen.getByRole("button", { name: en("task.done") });
    // The phone's readers get the hint (the web drops it and describes Done by its tooltip).
    expect(done.props["accessibilityHint"]).toBe(en("task.doneHint"));
    // What Done does, and only that: the way to another time is a control of its own, the long
    // press a shortcut nobody needs to be taught (QA round 20 L3).
    expect(en("task.doneHint")).not.toMatch(/long press/iu);
  });

  it("says so when the task does not exist", async () => {
    await renderScreen(<TaskScreen id="t-nope" />, await createTestRuntime());
    expect(screen.getByText(en("task.notFound"))).toBeOnTheScreen();
    // No project picker over a task that is not there (QA 17 L11).
    expect(screen.queryByText(en("task.noProject"))).toBeNull();
  });
});
