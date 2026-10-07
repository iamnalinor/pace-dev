import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, WORK_ID } from "@pace/core/testing";

import { Composer } from "./composer.tsx";

const line = () => screen.getByLabelText(en("composer.label"));

describe("Composer", () => {
  it("reads the line into chips and adds the task", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Composer />, runtime);
    await fireEvent.changeText(line(), "синк по дашборду завтра 15:00 1ч");
    expect(screen.getByRole("button", { name: "Work", selected: true })).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: en("importance.normal"), selected: true }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("composer.add") }));
    await waitFor(() => {
      const created = Object.values(runtime.state.store.getState().tasks.byId).find(
        (task) => task.title === "синк по дашборду",
      );
      expect(created).toMatchObject({ importance: "normal", presetId: "work", projectId: WORK_ID });
    });
    expect(line()).toHaveDisplayValue("");
  });

  it("preselects the importance of a category picked with one tap", async () => {
    await renderScreen(<Composer />, await createTestRuntime());
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(screen.getByRole("button", { name: "Deferred" }));
    expect(
      screen.getByRole("button", { name: en("importance.nice_to_have"), selected: true }),
    ).toBeOnTheScreen();
  });

  it("adds typed problems to this week's homework", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<Composer />, runtime);
    await fireEvent.changeText(line(), "дз по алгебре 8, 9");
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

  it("fills the chips from the assistant and says what to check", async () => {
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
    await fireEvent.changeText(line(), "срочно разобрать почту");
    await fireEvent.press(screen.getByRole("button", { name: en("composer.ai") }));
    expect(await screen.findByText(/Check: estimate/u)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Work", selected: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("composer.add") }));
    await waitFor(() => {
      const created = Object.values(runtime.state.store.getState().tasks.byId).find(
        (task) => task.title === "разобрать почту",
      );
      expect(created).toMatchObject({ estimateMinutes: 90, importance: "asap", presetId: "work" });
    });
  });
});
