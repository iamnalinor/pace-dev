import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, WORK_ID } from "@pace/core/testing";

import { Composer } from "./composer.tsx";

const line = () => screen.getByLabelText(en("composer.label"));

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
  it("reads the line on Enter into the form in place; a second Enter adds it", async () => {
    const runtime = await createTestRuntime({ routes: { "POST /api/parse": () => PARSED } });
    await renderScreen(<Composer />, runtime);
    // Typed, not pasted: nothing goes to the assistant until Enter.
    await fireEvent.changeText(line(), "срочно почта");
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    await enter();
    // The same card turns into the form: no sheet, no second window.
    expect(await screen.findByText(/Check: estimate/u)).toBeOnTheScreen();
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
      expect(screen.queryByRole("form")).toBeNull();
    });
  });

  it("opens the form with the rules' reading when the assistant cannot be reached", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Composer />, runtime);
    // Typed in steps (all at once it would read as a paste).
    await fireEvent.changeText(line(), "синк по дашборду");
    await fireEvent.changeText(line(), "синк по дашборду завтра 15:00 1ч");
    await enter();
    expect(await screen.findByText(en("composer.aiFailed"))).toBeOnTheScreen();
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
    await renderScreen(<Composer />, runtime);
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(screen.getByRole("button", { name: en("composer.expand") }));
    expect(screen.queryByLabelText(en("composer.label"))).toBeNull();
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

  it("collapses back to the line, which keeps the text", async () => {
    await renderScreen(<Composer />, await createTestRuntime());
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(screen.getByRole("button", { name: en("composer.expand") }));
    await fireEvent.press(screen.getByRole("button", { name: en("composer.collapse") }));
    expect(line()).toHaveDisplayValue("renew the passport");
    // The form folds away once its animation is over.
    await waitFor(() => {
      expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    });
  });

  it("adds typed problems to this week's homework from the form", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Composer />, runtime);
    await fireEvent.changeText(line(), "дз по алгебре 8, 9");
    await fireEvent.press(screen.getByRole("button", { name: en("composer.expand") }));
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
    await renderScreen(<Composer initialText="think about the trip" />, runtime);
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
    await renderScreen(<Composer />, runtime);
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
