import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { PaceRuntime } from "#app/runtime.ts";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { NowScreen } from "./now-screen.tsx";

// A computer's window: the list with a pane beside it.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));

const button = (key: Parameters<typeof en>[0]) => screen.getByRole("button", { name: en(key) });
/** The line (its label, "New task", is the + button's name as well). */
const line = () => screen.getByPlaceholderText(en("composer.placeholder"));
const title = () => screen.getByLabelText(en("edit.taskTitle"));
/** The picked task's details, by the action only they have. */
const taskDetails = () => screen.queryByRole("button", { name: en("task.edit") });

const titles = (runtime: PaceRuntime): readonly string[] =>
  Object.values(runtime.state.store.getState().tasks.byId).map((task) => task.title);

/** The submit sheet a per-subtask task's check opens. */
const submitSheet = () => screen.queryByText(en("close.subtitleSolved", { title: "Algebra HW 6" }));

describe("NowScreen on a wide window", () => {
  it("opens the task just approved by the assistant in place of the previously picked task", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "POST /api/parse": () => ({
          actions: [
            {
              kind: "task.create",
              summary: "New task: Write report",
              task: {
                description: null,
                dueAt: null,
                dueTz: null,
                estimateMinutes: null,
                importance: null,
                link: null,
                presetId: "personal",
                projectId: null,
                projectName: null,
                sourceText: "Write report",
                subtasks: [],
                title: "Write report",
              },
            },
          ],
          confidence: 1,
          domain: "task",
          provider: "fake",
          status: "parsed",
        }),
      },
    });
    await renderScreen(<NowScreen />, runtime);
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(screen.getByRole("header", { name: "Algebra HW 6" })).toBeOnTheScreen();
    await fireEvent.changeText(line(), "Write report");
    await fireEvent.press(button("composer.send"));
    await fireEvent.press(await screen.findByRole("button", { name: en("assistant.approve") }));
    await waitFor(() => {
      expect(screen.getByRole("header", { name: "Write report" })).toBeOnTheScreen();
    });
    expect(screen.queryByRole("header", { name: "Algebra HW 6" })).toBeNull();
  });

  it("opens the submit sheet once: after the form has come and gone, the task is back without it", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Algebra HW 6 done" }));
    expect(submitSheet()).toBeOnTheScreen();
    await fireEvent.press(button("nav.newTask"));
    await fireEvent.press(button("common.close"));
    expect(taskDetails()).toBeOnTheScreen();
    expect(submitSheet()).toBeNull();
  });

  it("keeps the line still while the pane's form holds its draft", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<NowScreen />, runtime);
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(button("nav.newTask"));
    await fireEvent.changeText(title(), "renew the passport at the embassy");
    // The draft is the form's now: the line shows it but takes no keys, Send and To Inbox wait.
    expect(line()).toHaveProp("editable", false);
    expect(button("composer.send")).toBeDisabled();
    expect(button("composer.toInbox")).toBeDisabled();
    await fireEvent.press(button("common.close"));
    expect(line()).toHaveProp("editable", true);
    expect(button("composer.toInbox")).toBeEnabled();
  });

  it("opens the form in the right pane while the line stays in the list, then returns to the picked task", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<NowScreen />, runtime);
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(taskDetails()).toBeOnTheScreen();
    await fireEvent.press(button("nav.newTask"));
    // The pane holds the form in place of the task; the line is still in the list's column.
    expect(screen.getByRole("header", { name: en("form.newTask") })).toBeOnTheScreen();
    expect(taskDetails()).toBeNull();
    expect(line()).toBeOnTheScreen();
    await fireEvent.changeText(title(), "pay the rent");
    await fireEvent(title(), "submitEditing");
    await waitFor(() => {
      expect(titles(runtime)).toContain("pay the rent");
    });
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    expect(taskDetails()).toBeOnTheScreen();
  });

  it("closes back to the pane's empty state, the typed line kept", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(button("nav.newTask"));
    expect(title()).toHaveDisplayValue("renew the passport");
    await fireEvent.press(button("common.close"));
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    expect(screen.getByText(en("now.pickTask"))).toBeOnTheScreen();
    expect(line()).toHaveDisplayValue("renew the passport");
  });

  it("shows a task picked while the form is open, the draft folded back into the line", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(button("nav.newTask"));
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    expect(taskDetails()).toBeOnTheScreen();
    expect(line()).toHaveDisplayValue("renew the passport");
  });
});
