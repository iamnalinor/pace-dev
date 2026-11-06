import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { withWindowWidth } from "#app/test/window.ts";

import { HistoryScreen } from "./history-screen.tsx";

describe("HistoryScreen", () => {
  it("offers one visible Undo for a task: its latest undoable event; an earlier one is the way in itself (F-CMP-14)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    const created = await runtime.actions.captureInbox("Water the plants");
    if (!created.ok) {
      throw new Error("no capture");
    }
    const taskId = created.value[0]?.type === "task.created" ? created.value[0].payload.taskId : "";
    await runtime.actions.setImportance(taskId, "asap");
    await renderScreen(<HistoryScreen />, runtime);
    expect(await screen.findAllByRole("button", { name: en("common.undo") })).toHaveLength(1);
    const earlier = screen.getAllByRole("button", { name: /^Undo: / });
    expect(earlier.length).toBeGreaterThan(0);
    // Pressing it asks the same question, and nothing is undone before the answer.
    const revoke = jest.spyOn(runtime.actions, "revoke");
    await fireEvent.press(earlier[0] as never);
    expect(screen.getByRole("header", { name: en("history.undoConfirm") })).toBeOnTheScreen();
    expect(revoke).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: en("history.undoConfirm") }));
    await waitFor(() => {
      expect(revoke).toHaveBeenCalledTimes(1);
    });
  });

  it("draws the snapshot read-only: a dot leads each task, no check circle", async () => {
    await renderScreen(<HistoryScreen />, await createTestRuntime());
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("says an empty account teaches what shows up here, with no list at all", async () => {
    await renderScreen(<HistoryScreen />, await createTestRuntime({ world: "empty" }));
    expect(await screen.findByText(en("history.emptyAccount"))).toBeOnTheScreen();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("HistoryScreen's period at 320", () => {
  withWindowWidth(320);

  it("shows the short moment so › stays in the pill, the long one at 390", async () => {
    await renderScreen(<HistoryScreen />, await createTestRuntime({ world: "empty" }));
    expect(screen.getByText(/^\d{1,2}\/\d{1,2}, /u)).toBeOnTheScreen();
  });
});
