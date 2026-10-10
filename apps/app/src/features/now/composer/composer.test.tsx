import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, WORK_ID } from "@pace/core/testing";

import { Composer } from "./composer.tsx";

const line = () => screen.getByLabelText(en("composer.label"));

const enter = async (): Promise<void> => {
  await fireEvent(line(), "keyPress", {
    nativeEvent: { key: "Enter" },
    preventDefault: () => undefined,
  });
};

const created = (runtime: Awaited<ReturnType<typeof createTestRuntime>>, title: string) =>
  Object.values(runtime.state.store.getState().tasks.byId).find((task) => task.title === title);

describe("Composer", () => {
  it("adds a short line as it is with Enter, read by the rules", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Composer />, runtime);
    await fireEvent.changeText(line(), "синк по дашборду завтра 15:00 1ч");
    expect(screen.getByText(en("composer.quickHint"))).toBeOnTheScreen();
    await enter();
    await waitFor(() => {
      expect(created(runtime, "синк по дашборду")).toMatchObject({
        importance: "normal",
        presetId: "work",
        projectId: WORK_ID,
      });
    });
    expect(line()).toHaveDisplayValue("");
  });

  it("opens the form by hand, where a picked category brings its importance", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Composer />, runtime);
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(screen.getByRole("button", { name: en("composer.byHand") }));
    expect(screen.getByLabelText(en("edit.taskTitle"))).toHaveDisplayValue("renew the passport");
    await fireEvent.press(screen.getByRole("radio", { name: "Deferred" }));
    expect(
      screen.getByRole("radio", { checked: true, name: en("importance.nice_to_have") }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("form.create") }));
    await waitFor(() => {
      expect(created(runtime, "renew the passport")).toMatchObject({ presetId: "deferred" });
    });
  });

  it("adds typed problems to this week's homework from the form", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Composer />, runtime);
    await fireEvent.changeText(line(), "дз по алгебре 8, 9");
    await fireEvent.press(screen.getByRole("button", { name: en("composer.byHand") }));
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

  it("parses on the button into the form and says what to check", async () => {
    const parsed = {
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
    const runtime = await createTestRuntime({ routes: { "POST /api/parse": () => parsed } });
    await renderScreen(<Composer />, runtime);
    // Typed, not pasted: nothing goes to the assistant until Parse.
    await fireEvent.changeText(line(), "срочно почта");
    expect(screen.queryByText(/Check: estimate/u)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("composer.parse") }));
    expect(await screen.findByText(/Check: estimate/u)).toBeOnTheScreen();
    expect(screen.getByRole("radio", { checked: true, name: "Work" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("form.create") }));
    await waitFor(() => {
      expect(created(runtime, "разобрать почту")).toMatchObject({
        estimateMinutes: 90,
        importance: "asap",
        presetId: "work",
      });
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
