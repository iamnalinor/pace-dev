import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import type { PaceRuntime } from "#app/runtime.ts";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { TimeBar } from "./time-bar.tsx";

const running = (runtime: PaceRuntime): readonly string[] =>
  Object.values(runtime.state.store.getState().time.activities)
    .filter((activity) => activity.endAt === null)
    .map((activity) => activity.label);

describe("TimeBar", () => {
  it("starts an activity with one tap, switches with the next and stops with a second tap", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    expect(screen.getByLabelText("What are you doing?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("switch", { name: "Rest" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Rest"]);
    });
    expect(screen.getByRole("switch", { checked: true, name: "Rest" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("switch", { name: "Food" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Food"]);
    });
    expect(screen.getByText("of ~30m")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("switch", { name: "Food" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual([]);
    });
  });

  it("stops the running activity from the Stop button", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("switch", { name: "Sport" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Stop" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual([]);
    });
  });

  it("opens the details on press and hold, and the button editor from there", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent(screen.getByRole("switch", { name: "Commute" }), "longPress");
    await fireEvent.press(await screen.findByRole("button", { name: "Change the button" }));
    const name = await screen.findByLabelText("Name");
    await fireEvent.changeText(name, "Метро");
    await fireEvent.changeText(screen.getByLabelText("Expect, minutes"), "35");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("switch", { name: "Метро" })).toBeOnTheScreen();
    expect(runtime.state.store.getState().time.buttons["btn:commute"]).toMatchObject({
      expectMinutes: 35,
      label: "Метро",
    });
    expect(running(runtime)).toEqual([]);
  });

  it("asks Study for details first: a picked homework names and links the block", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("switch", { name: "Study" }));
    expect(running(runtime)).toEqual([]);
    await fireEvent.press(await screen.findByRole("radio", { name: "Algebra HW 6" }));
    expect(screen.getByLabelText("What exactly")).toHaveDisplayValue("Algebra HW 6");
    await fireEvent.press(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Algebra HW 6"]);
    });
    const started = Object.values(runtime.state.store.getState().time.activities).find(
      (activity) => activity.endAt === null,
    );
    expect(started).toMatchObject({ category: "study" });
    expect(started?.taskId).not.toBeNull();
  });

  it("starts what is typed in “What are you doing?”", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    const field = screen.getByLabelText("What are you doing?");
    await fireEvent.changeText(field, "Walk the dog");
    await fireEvent(field, "submitEditing");
    await waitFor(() => {
      expect(running(runtime)).toEqual(["Walk the dog"]);
    });
  });

  it("adds a button from the plus", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: "Add activity" }));
    await fireEvent.changeText(await screen.findByLabelText("Name"), "Reading");
    await fireEvent.press(
      within(screen.getByLabelText("Category")).getByRole("radio", { name: "Study" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        Object.values(runtime.state.store.getState().time.buttons).map((button) => button.label),
      ).toContain("Reading");
    });
  });
});
