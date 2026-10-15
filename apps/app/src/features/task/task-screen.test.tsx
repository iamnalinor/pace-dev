import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, HW_VIEW_NOW, TRK_ID, TRK_NOW } from "@pace/core/testing";

import { TaskScreen } from "./task-screen.tsx";

beforeEach(() => {
  jest.clearAllMocks();
});

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

describe("TaskScreen — work", () => {
  it("shows its link and description, and no ranking card", async () => {
    await trkScreen();
    expect(screen.getByText("tracker.example.com ↗")).toBeOnTheScreen();
    expect(
      screen.getByText("p99 check fails ~1 in 5 runs on the shared runner."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Why it's/u })).toBeNull();
    expect(screen.queryByRole("button", { name: "Waiting" })).toBeNull();
  });

  it("moves the progress slider in percent, the work left following at once", async () => {
    const runtime = await trkScreen();
    expect(screen.getByText("40%")).toBeOnTheScreen();
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
    expect(screen.getByText("50%")).toBeOnTheScreen();
    expect(workLeft()).not.toBe(before);
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.slider).toBe(5);
    });
    expect(screen.getByText("50%")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.pause") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]?.status).toBe("paused");
    });
    expect(screen.getByRole("button", { name: en("task.resume") })).toBeOnTheScreen();
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
    await fireEvent.press(screen.getByRole("radio", { name: /^Due: /u }));
    await fireEvent.press(screen.getByRole("button", { name: en("composer.clear") }));
    await fireEvent.press(screen.getByRole("radio", { name: /^Estimate: /u }));
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

  it("gives up from the header's ⊘: the close sheet opens on Cancelled · Skipped", async () => {
    await trkScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.giveUp") }));
    expect(screen.getByRole("radio", { name: en("close.skipped") })).toBeOnTheScreen();
  });

  it("deletes from the header's trash at once, goes back, and Undo brings it back", async () => {
    const runtime = await trkScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.delete") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]).toBeUndefined();
    });
    expect(router.back).toHaveBeenCalled();
    await fireEvent.press(await screen.findByRole("button", { name: en("common.undo") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().tasks.byId[TRK_ID]).toBeDefined();
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

  it("says so when the task does not exist", async () => {
    await renderScreen(<TaskScreen id="t-nope" />, await createTestRuntime());
    expect(screen.getByText(en("task.notFound"))).toBeOnTheScreen();
  });
});
