import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { PaceRuntime } from "#app/runtime.ts";

import { en, renderScreen } from "#app/test/render.tsx";
import { paramsSet, redirected, searchParams, setSearchParams } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID } from "@pace/core/testing";

import { NowScreen } from "./now-screen.tsx";

// A computer's window: the list with a pane beside it (a test may narrow it to a phone's).
const mockWindow = { isWide: true };
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => mockWindow.isWide,
}));

/** The shortcuts registered while mounted, by key: the web build's keyboard, as a test drives it. */
const mockHotkeys = new Map<string, () => void>();
jest.mock("#app/ui/use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual("#app/ui/use-hotkey.tsx"),
  useHotkey: (hotkey: undefined | { readonly key: string }, onPress: () => void) => {
    if (hotkey !== undefined) {
      mockHotkeys.set(hotkey.key, onPress);
    }
  },
}));

/** The browser's history steps the screen takes, and the steps it takes back (the web build's). */
const mockHistory = { back: [] as string[], steps: 0 };
jest.mock("#app/platform/push-entry.ts", (): unknown => ({
  ...jest.requireActual("#app/platform/push-entry.ts"),
  usePushEntry: () => () => {
    mockHistory.steps += 1;
  },
  useStepBack: () => (name: string) => {
    mockHistory.back.push(name);
    return false;
  },
}));

beforeEach(() => {
  mockHistory.back.length = 0;
  mockHistory.steps = 0;
  mockWindow.isWide = true;
  redirected.mockClear();
  mockHotkeys.clear();
});

/** Escape, as the web build's keyboard hands it to the shortcut registered last. */
const pressEscape = async (): Promise<void> => {
  await act(() => {
    mockHotkeys.get("Escape")?.();
  });
};

const button = (key: Parameters<typeof en>[0]) => screen.getByRole("button", { name: en(key) });
/** The line (its label, "New task", is the + button's name as well). */
const line = () => screen.getByPlaceholderText(en("composer.placeholder"));
const title = () => screen.getByLabelText(en("edit.taskTitle"));
/** The picked task's details, by the action only they have. */
const taskDetails = () => screen.queryByRole("button", { name: en("task.edit") });

const titles = (runtime: PaceRuntime): readonly string[] =>
  Object.values(runtime.state.store.getState().tasks.byId).map((task) => task.title);

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
    await fireEvent.changeText(line(), "pay the rent");
    await fireEvent.press(button("nav.newTask"));
    // The pane holds the form in place of the task; the line is still in the list's column.
    expect(screen.getByRole("header", { name: en("form.newTask") })).toBeOnTheScreen();
    expect(taskDetails()).toBeNull();
    expect(line()).toBeOnTheScreen();
    await fireEvent(title(), "submitEditing");
    await waitFor(() => {
      expect(titles(runtime)).toContain("pay the rent");
    });
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    expect(taskDetails()).toBeOnTheScreen();
  });

  it("closes the inspector with the form, the typed line kept (collapsed with nothing picked, F-LAY-03)", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(button("nav.newTask"));
    expect(title()).toHaveDisplayValue("renew the passport");
    await fireEvent.press(button("common.close"));
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    expect(screen.queryByLabelText(en("now.details"))).toBeNull();
    expect(line()).toHaveDisplayValue("renew the passport");
  });

  it("offers + beside the line only once it has text, and opens the form in the labelled inspector (F-CMP-18, F-LAY-03)", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    expect(screen.queryByRole("button", { name: en("nav.newTask") })).toBeNull();
    expect(screen.queryByLabelText(en("now.details"))).toBeNull();
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(button("nav.newTask"));
    expect(screen.getByLabelText(en("now.details"))).toBeOnTheScreen();
  });

  it("shows a task picked while the form is open: the form's draft goes, the line keeps its text", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(button("nav.newTask"));
    await fireEvent.changeText(title(), "renew the passport at the embassy");
    await fireEvent.press(screen.getByRole("radio", { name: en("form.repeat.daily") }));
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    expect(taskDetails()).toBeOnTheScreen();
    expect(line()).toHaveDisplayValue("renew the passport");
    // Every way out of the form drops its draft (QA round 14 L6), not only the close.
    await fireEvent.press(button("nav.newTask"));
    expect(title()).toHaveDisplayValue("renew the passport");
    expect(
      screen.getByRole("radio", { checked: true, name: en("form.repeat.none") }),
    ).toBeOnTheScreen();
  });
});

describe("NowScreen: the open task is in the address (feedback 5 item 6)", () => {
  it("puts the picked task in ?task= and closes it by taking the param off", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(searchParams()).toEqual({ task: HW_ID });
    expect(screen.getByRole("header", { name: "Algebra HW 6" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("common.close") }));
    expect(searchParams()).toEqual({});
    expect(taskDetails()).toBeNull();
  });

  it("closes the pane on Escape (UI review I4, QA round 24 R24-01)", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(taskDetails()).toBeOnTheScreen();
    await pressEscape();
    await waitFor(() => {
      expect(taskDetails()).toBeNull();
    });
    expect(searchParams()).toEqual({});
  });

  it("lets the description being edited take Escape: the edit goes, the pane stays (R24-01)", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    await fireEvent.press(screen.getByRole("button", { name: en("task.addDescription") }));
    const field = screen.getByLabelText(en("edit.description"));
    await fireEvent(field, "keyPress", { nativeEvent: { key: "Escape" } });
    expect(screen.queryByLabelText(en("edit.description"))).toBeNull();
    expect(taskDetails()).toBeOnTheScreen();
    expect(searchParams()).toEqual({ task: HW_ID });
  });

  it("takes a deleted task off the address without a step, so Back does not stop on it (review I2)", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<NowScreen />, runtime);
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(searchParams()).toEqual({ task: HW_ID });
    const steps = mockHistory.steps;
    await fireEvent.press(button("task.menu"));
    await fireEvent.press(await screen.findByRole("button", { name: en("task.delete") }));
    await fireEvent.press(button("common.delete"));
    await waitFor(() => {
      expect(searchParams()).toEqual({});
    });
    expect(runtime.state.store.getState().tasks.byId[HW_ID]).toBeUndefined();
    expect(mockHistory.steps).toBe(steps);
    expect(mockHistory.back).toEqual(["task"]);
  });

  it("reopens the task the address names after a reload", async () => {
    setSearchParams({ task: HW_ID });
    await renderScreen(<NowScreen />, await createTestRuntime());
    expect(screen.getByRole("header", { name: "Algebra HW 6" })).toBeOnTheScreen();
    expect(taskDetails()).toBeOnTheScreen();
  });

  it("leaves the pane closed for an unknown task, and writes nothing back (class 1: the address goes quiet)", async () => {
    setSearchParams({ task: "no-such-task" });
    await renderScreen(<NowScreen />, await createTestRuntime());
    expect(taskDetails()).toBeNull();
    expect(screen.queryByText(en("task.notFound"))).toBeNull();
    expect(paramsSet).not.toHaveBeenCalled();
  });
});

describe("NowScreen: a ?task= link opened at a phone's width (session review minor 6)", () => {
  it("opens the task on its own page, as a phone opens it", async () => {
    mockWindow.isWide = false;
    setSearchParams({ task: HW_ID });
    await renderScreen(<NowScreen />, await createTestRuntime());
    expect(redirected).toHaveBeenCalledWith(`/task/${HW_ID}`);
  });

  it("stays on the list for an unknown task, and writes nothing back", async () => {
    mockWindow.isWide = false;
    setSearchParams({ task: "no-such-task" });
    await renderScreen(<NowScreen />, await createTestRuntime());
    expect(redirected).not.toHaveBeenCalled();
    expect(paramsSet).not.toHaveBeenCalled();
  });
});
