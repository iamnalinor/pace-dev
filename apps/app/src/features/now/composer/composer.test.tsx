import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { PaceRuntime } from "#app/runtime.ts";

import { requestNewTask } from "#app/shared/new-task-request.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, WORK_ID } from "@pace/core/testing";

import { ComposerProvider } from "./composer-flow.tsx";
import { Composer } from "./composer.tsx";

/** The composer as Now draws it: the line's card over the one composer state. */
const renderComposer = async (runtime: PaceRuntime, initialText?: string) =>
  await renderScreen(
    <ComposerProvider initialText={initialText}>
      <Composer />
    </ComposerProvider>,
    runtime,
  );

/** The line (its label, "New task", is the + button's name as well). */
const line = () => screen.getByPlaceholderText(en("composer.placeholder"));
const button = (key: Parameters<typeof en>[0]) => screen.getByRole("button", { name: en(key) });
/** The open form's title: "New task", or where the suggestion came from. */
const formTitle = (key: "composer.form.suggested" | "form.newTask") =>
  screen.getByRole("header", { name: en(key) });

/** The keyboard's Enter on a phone submits the line (the web reads the key itself). */
const enter = async (): Promise<void> => {
  await fireEvent(line(), "submitEditing");
};

const title = () => screen.getByLabelText(en("edit.taskTitle"));

/** The second Enter: in the form's title. */
const enterInTitle = async (): Promise<void> => {
  await fireEvent(title(), "submitEditing");
};

const PARSED = {
  doubtful: ["estimateMinutes"],
  isClean: false,
  provider: "fake",
  result: {
    category: "work",
    description: null,
    dueDate: null,
    dueTime: null,
    estimateMinutes: 90,
    evidence: [],
    importance: "asap",
    intent: "create_task",
    outcome: null,
    project: null,
    questions: [],
    subtasks: [],
    task: null,
    title: "разобрать почту",
  },
  status: "parsed",
};

const created = (runtime: Awaited<ReturnType<typeof createTestRuntime>>, title: string) =>
  Object.values(runtime.state.store.getState().tasks.byId).find((task) => task.title === title);

describe("Composer", () => {
  it("is one line with New task, To Inbox and Send at its edges, and no hint or chevron", async () => {
    await renderComposer(await createTestRuntime());
    expect(
      screen.getAllByRole("button").map((b): unknown => b.props["accessibilityLabel"]),
    ).toEqual([en("nav.newTask"), en("composer.toInbox"), en("composer.send")]);
    // Nothing to send yet: Send and To Inbox wait for words.
    expect(button("composer.send")).toBeDisabled();
    expect(button("composer.toInbox")).toBeDisabled();
    await fireEvent.changeText(line(), "renew the passport");
    expect(button("composer.send")).toBeEnabled();
    expect(screen.queryByText(/Shift\+Enter/u)).toBeNull();
  });

  it("asks the assistant on Send, as on Enter", async () => {
    await renderComposer(await createTestRuntime({ routes: { "POST /api/parse": () => PARSED } }));
    await fireEvent.changeText(line(), "срочно почта");
    await fireEvent.press(button("composer.send"));
    expect(await screen.findByText(/Check: estimate/u)).toBeOnTheScreen();
    expect(formTitle("composer.form.suggested")).toBeOnTheScreen();
    expect(title()).toHaveDisplayValue("разобрать почту");
  });

  it("opens by hand on + after the assistant read the line: its reading gives way, the title says New task", async () => {
    await renderComposer(await createTestRuntime({ routes: { "POST /api/parse": () => PARSED } }));
    await fireEvent.changeText(line(), "срочно почта");
    await enter();
    expect(await screen.findByText(/Check: estimate/u)).toBeOnTheScreen();
    await fireEvent.press(button("common.close"));
    await fireEvent.press(button("nav.newTask"));
    expect(formTitle("form.newTask")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: en("composer.form.suggested") })).toBeNull();
    expect(title()).not.toHaveDisplayValue("разобрать почту");
  });

  it("keeps a subtask still being typed when Create is pressed", async () => {
    const runtime = await createTestRuntime();
    await renderComposer(runtime);
    await fireEvent.press(button("nav.newTask"));
    await fireEvent.changeText(title(), "read chapter 3");
    await fireEvent.press(button("form.addSubtask"));
    await fireEvent.changeText(screen.getByPlaceholderText(en("form.addSubtask")), "exercise 4");
    await fireEvent.press(button("form.create"));
    await waitFor(() => {
      expect(created(runtime, "read chapter 3")?.subtasks.map((item) => item.label)).toEqual([
        "exercise 4",
      ]);
    });
  });

  it("opens an empty form titled New task from its + and on a New task request", async () => {
    await renderComposer(await createTestRuntime());
    await fireEvent.press(button("nav.newTask"));
    expect(formTitle("form.newTask")).toBeOnTheScreen();
    expect(title()).toHaveDisplayValue("");
    await fireEvent.press(button("common.close"));
    await waitFor(() => {
      expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    });
    // The sidebar's New task (or N elsewhere) asks the Now in front for the form.
    await act(() => {
      requestNewTask();
    });
    expect(formTitle("form.newTask")).toBeOnTheScreen();
  });

  it("reads the line on Enter into the form in place; a second Enter adds it", async () => {
    const runtime = await createTestRuntime({ routes: { "POST /api/parse": () => PARSED } });
    await renderComposer(runtime);
    // Typed, not pasted: nothing goes to the assistant until Enter.
    await fireEvent.changeText(line(), "срочно почта");
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    await enter();
    // The same card turns into the form, which says where it came from: no sheet, no second window.
    expect(await screen.findByText(/Check: estimate/u)).toBeOnTheScreen();
    expect(formTitle("composer.form.suggested")).toBeOnTheScreen();
    expect(screen.queryByText(/Check before adding/u)).toBeNull();
    expect(title()).toHaveDisplayValue("разобрать почту");
    expect(screen.getByRole("radio", { checked: true, name: "Work" })).toBeOnTheScreen();
    expect(created(runtime, "разобрать почту")).toBeUndefined();
    await enterInTitle();
    await waitFor(() => {
      expect(created(runtime, "разобрать почту")).toMatchObject({
        estimateMinutes: 90,
        importance: "asap",
        presetId: "work",
        sourceText: "срочно почта",
      });
    });
    // Back to an empty line for the next one.
    expect(line()).toHaveDisplayValue("");
    await waitFor(() => {
      expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    });
  });

  it("opens the form with the rules' reading when the assistant cannot be reached", async () => {
    const runtime = await createTestRuntime();
    await renderComposer(runtime);
    // Typed in steps (all at once it would read as a paste).
    await fireEvent.changeText(line(), "синк по дашборду");
    await fireEvent.changeText(line(), "синк по дашборду завтра 15:00 1ч");
    await enter();
    expect(await screen.findByText(en("composer.aiFailed"))).toBeOnTheScreen();
    // The assistant read nothing: the form is the person's own.
    expect(formTitle("form.newTask")).toBeOnTheScreen();
    expect(title()).toHaveDisplayValue("синк по дашборду");
    await enterInTitle();
    await waitFor(() => {
      expect(created(runtime, "синк по дашборду")).toMatchObject({
        importance: "normal",
        presetId: "work",
        projectId: WORK_ID,
      });
    });
    // Typed by hand: the line is the title, nothing to keep as an original message.
    expect(created(runtime, "синк по дашборду")?.sourceText).toBeNull();
  });

  it("expands to the form by hand: the line moves into the title, a category brings its importance", async () => {
    const runtime = await createTestRuntime();
    await renderComposer(runtime);
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(screen.getByRole("button", { name: en("nav.newTask") }));
    expect(screen.queryByPlaceholderText(en("composer.placeholder"))).toBeNull();
    expect(title()).toHaveDisplayValue("renew the passport");
    expect(screen.queryByRole("button", { name: /Fill in by hand/u })).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: "Deferred" }));
    expect(
      screen.getByRole("radio", { checked: true, name: en("importance.nice_to_have") }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("form.create") }));
    await waitFor(() => {
      expect(created(runtime, "renew the passport")).toMatchObject({ presetId: "deferred" });
    });
  });

  it("adds a title typed into the form over an empty line", async () => {
    const runtime = await createTestRuntime();
    await renderComposer(runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("nav.newTask") }));
    // Nothing to create yet.
    expect(screen.getByRole("button", { name: en("form.create") })).toBeDisabled();
    await fireEvent.changeText(title(), "pay the rent");
    await fireEvent.press(screen.getByRole("button", { name: en("form.create") }));
    await waitFor(() => {
      expect(created(runtime, "pay the rent")).toBeDefined();
    });
    expect(screen.queryByText(en("actionError.action/empty-text"))).toBeNull();
  });

  it("adds it on Enter in the title as well", async () => {
    const runtime = await createTestRuntime();
    await renderComposer(runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("nav.newTask") }));
    await fireEvent.changeText(title(), "pay the rent");
    await enterInTitle();
    await waitFor(() => {
      expect(created(runtime, "pay the rent")).toBeDefined();
    });
  });

  it("collapses back to the line, which keeps the text", async () => {
    await renderComposer(await createTestRuntime());
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(screen.getByRole("button", { name: en("nav.newTask") }));
    await fireEvent.press(screen.getByRole("button", { name: en("common.close") }));
    expect(line()).toHaveDisplayValue("renew the passport");
    // The form folds away once its animation is over.
    await waitFor(() => {
      expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    });
  });

  it("adds typed subtasks to this week's homework from the form", async () => {
    const runtime = await createTestRuntime();
    await renderComposer(runtime);
    await fireEvent.changeText(line(), "дз по алгебре 8, 9");
    await fireEvent.press(screen.getByRole("button", { name: en("nav.newTask") }));
    expect(screen.getByRole("radio", { checked: true, name: "Algebra HW 6" })).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: en("composer.addTo", { title: "Algebra HW 6" }) }),
    );
    await waitFor(() => {
      const labels = runtime.state.store.getState().tasks.byId[HW_ID]?.subtasks.map((s) => s.label);
      expect(labels?.slice(-2)).toEqual(["8", "9"]);
    });
  });

  it("sends the raw line to Inbox", async () => {
    const runtime = await createTestRuntime();
    await renderComposer(runtime, "think about the trip");
    await fireEvent.press(screen.getByRole("button", { name: en("composer.toInbox") }));
    await waitFor(() => {
      const titles = Object.values(runtime.state.store.getState().tasks.byId).map((t) => t.title);
      expect(titles).toContain("think about the trip");
    });
  });

  it("parses a pasted homework at once and writes nothing until Create", async () => {
    const homework =
      "№№ 290, 292, 293 — решить методом выделения линейных множителей. № 365 (определитель)";
    const reading = {
      doubtful: [],
      isClean: true,
      provider: "fake",
      result: {
        category: null,
        description: null,
        dueDate: null,
        dueTime: null,
        estimateMinutes: null,
        evidence: [],
        importance: null,
        intent: "create_task",
        outcome: null,
        project: null,
        questions: [],
        subtasks: ["290", "292", "293", "365"].map((label) => ({ label, number: Number(label) })),
        task: null,
        title: "ДЗ по алгебре: № 290–365",
      },
      status: "parsed",
    };
    const runtime = await createTestRuntime({ routes: { "POST /api/parse": () => reading } });
    await renderComposer(runtime);
    await fireEvent.changeText(line(), homework);
    expect(await screen.findByLabelText(en("edit.taskTitle"))).toHaveDisplayValue(
      "ДЗ по алгебре: № 290–365",
    );
    const added = () =>
      Object.values(runtime.state.store.getState().tasks.byId).find(
        (task) => task.sourceText === homework,
      );
    expect(added()).toBeUndefined();
    await fireEvent.press(screen.getByRole("button", { name: en("form.create") }));
    await waitFor(() => {
      expect(added()?.title).toBe("ДЗ по алгебре: № 290–365");
    });
    expect(added()?.subtasks).toHaveLength(4);
  });
});
