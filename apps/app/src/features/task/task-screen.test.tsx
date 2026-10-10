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
  it("shows the start, the due, the work left and the problems with their states", async () => {
    await hwScreen();
    expect(screen.getByRole("header", { name: "Algebra HW 6" })).toBeOnTheScreen();
    expect(screen.getByText("today 23:59")).toBeOnTheScreen();
    expect(screen.getByText("1h 43m")).toBeOnTheScreen();
    expect(screen.getByText(en("task.start"))).toBeOnTheScreen();
    expect(screen.queryByText(/of window gone/u)).toBeNull();
    expect(screen.getByText(en("task.problemsSummary", { sent: 2, solved: 4 }))).toBeOnTheScreen();
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

  it("toggles a problem solved and back", async () => {
    const runtime = await hwScreen();
    const problem = screen.getByRole("checkbox", { name: "Kronecker–Capelli" });
    expect(problem).not.toBeChecked();
    await fireEvent.press(problem);
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

  it("moves the progress slider and pauses the task", async () => {
    const runtime = await trkScreen();
    expect(screen.getByText("4 / 10")).toBeOnTheScreen();
    await fireEvent(
      screen.getByRole("adjustable", { name: en("task.progressAria") }),
      "accessibilityAction",
      {
        nativeEvent: { actionName: "increment" },
      },
    );
    await waitFor(() => {
      expect(screen.getByText("5 / 10")).toBeOnTheScreen();
    });
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

  it("deletes from the header's trash: the close sheet opens on Cancelled · Skipped", async () => {
    await trkScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("task.delete") }));
    expect(screen.getByRole("radio", { name: en("close.skipped") })).toBeOnTheScreen();
  });

  it("says so when the task does not exist", async () => {
    await renderScreen(<TaskScreen id="t-nope" />, await createTestRuntime());
    expect(screen.getByText(en("task.notFound"))).toBeOnTheScreen();
  });
});
