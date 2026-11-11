import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import * as reanimated from "react-native-reanimated";

import type { NowRow } from "@pace/client";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { PAGE_SIZE, TaskRows } from "./task-list.tsx";
import { TaskOpenerProvider } from "./task-opener.tsx";

const rows = (count: number): readonly NowRow[] =>
  Array.from({ length: count }, (_, index) => ({
    color: "green",
    dimmed: false,
    dueAt: null,
    id: `task-${String(index)}`,
    importance: "normal",
    meta: [],
    progress: 0,
    projectId: null,
    tag: { kind: "project", name: "Thesis" },
    title: `Task ${String(index)}`,
  }));

/** `count` rows with every animation's completion held; the test changes the store's rows. */
const leavingList = async (count = 3) => {
  const completions: ((isFinished?: boolean) => void)[] = [];
  jest.spyOn(reanimated, "withTiming").mockImplementation((to, _config, onEnd) => {
    if (onEnd !== undefined) {
      completions.push(onEnd);
    }
    return to;
  });
  const runtime = await createTestRuntime({ world: "empty" });
  const close = jest.spyOn(runtime.actions, "closeTask").mockResolvedValue({ ok: true, value: [] });
  const all = rows(count);
  const opened: string[] = [];
  // The store's rows, changed by the test as the store would.
  const store = { set: (_shown: readonly NowRow[]): void => undefined };
  const List = () => {
    const [shown, setShown] = useState(all);
    store.set = setShown;
    return (
      <TaskOpenerProvider
        open={(id: string) => {
          opened.push(id);
        }}
        selectedId={null}
      >
        <TaskRows label="Tasks" rows={shown} />
      </TaskOpenerProvider>
    );
  };
  await renderScreen(<List />, runtime);
  const show = async (shown: readonly NowRow[]) => {
    await act(async () => {
      store.set(shown);
      await Promise.resolve();
    });
  };
  const finishAnimations = async () => {
    await act(async () => {
      for (const done of completions.splice(0)) {
        done(true);
      }
      await Promise.resolve();
    });
  };
  return { all, close, finishAnimations, opened, show };
};

/** The rows' titles, top to bottom. */
const titles = (): readonly string[] =>
  screen.getAllByRole("checkbox").map((check) => {
    const label = String(check.props["accessibilityLabel"]);
    return label.replace(/^Mark (.*) done$/u, "$1");
  });

const without = (all: readonly NowRow[], ...ids: readonly string[]) =>
  all.filter((row) => !ids.includes(row.id));

const rowCount = () => screen.getAllByTestId("list-row-box").length;

describe("TaskRows", () => {
  it("mounts at most 40 rows of 1 284 at first, and a page more on request (F-DAT-03)", async () => {
    await renderScreen(
      <TaskOpenerProvider open={jest.fn()} selectedId={null}>
        <TaskRows label="Tasks" rows={rows(1284)} />
      </TaskOpenerProvider>,
      await createTestRuntime({ world: "empty" }),
    );
    expect(screen.getAllByTestId("list-row-box").length).toBeLessThanOrEqual(40);
    expect(screen.getAllByTestId("list-row-box")).toHaveLength(PAGE_SIZE);
    await fireEvent.press(screen.getByRole("button", { name: /Show 30 more/u }));
    await waitFor(() => {
      expect(screen.getAllByTestId("list-row-box")).toHaveLength(PAGE_SIZE * 2);
    });
  });

  describe("a checked row leaving (spec §6)", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("writes the close on the press and keeps the row, where it stood, until its animation ends", async () => {
      const { all, close, finishAnimations, show } = await leavingList();
      await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Task 1 done" }));
      expect(close).toHaveBeenCalledTimes(1);
      // The store drops the row at once (the close shows before it is written): it still leaves.
      await show(all.filter((row) => row.id !== "task-1"));
      expect(rowCount()).toBe(3);
      expect(
        screen
          .getAllByRole("checkbox")
          .map((check) => check.props["accessibilityLabel"] as unknown),
      ).toEqual(["Mark Task 0 done", "Mark Task 1 done", "Mark Task 2 done"]);
      await finishAnimations();
      expect(screen.queryByText("Task 1")).toBeNull();
      expect(rowCount()).toBe(2);
    });

    it("shows a row again that was undone while it was leaving", async () => {
      const { all, finishAnimations, show } = await leavingList();
      await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Task 1 done" }));
      await show(all.filter((row) => row.id !== "task-1"));
      await show(all);
      await finishAnimations();
      expect(screen.getByText("Task 1")).toBeOnTheScreen();
      expect(screen.getByRole("checkbox", { name: "Mark Task 1 done" })).not.toBeChecked();
    });

    it("closes once for a double tap: the second press on a leaving row does nothing", async () => {
      const { close } = await leavingList();
      const check = screen.getByRole("checkbox", { name: "Mark Task 1 done" });
      await fireEvent.press(check);
      await fireEvent.press(check);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it("does not open a row that is leaving", async () => {
      const { opened } = await leavingList();
      await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Task 1 done" }));
      await fireEvent.press(screen.getByText("Task 1"));
      expect(opened).toEqual([]);
    });

    it("keeps two rows checked in a row where they stood until each has gone", async () => {
      const { all, finishAnimations, show } = await leavingList(5);
      await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Task 1 done" }));
      await show(without(all, "task-1"));
      await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Task 3 done" }));
      await show(without(all, "task-1", "task-3"));
      expect(titles()).toEqual(["Task 0", "Task 1", "Task 2", "Task 3", "Task 4"]);
      await finishAnimations();
      expect(titles()).toEqual(["Task 0", "Task 2", "Task 4"]);
    });

    it("keeps the later row in place when the earlier one is gone first", async () => {
      const { all, show } = await leavingList(5);
      const completions: ((isFinished?: boolean) => void)[] = [];
      jest.spyOn(reanimated, "withTiming").mockImplementation((to, _config, onEnd) => {
        if (onEnd !== undefined) {
          completions.push(onEnd);
        }
        return to;
      });
      await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Task 1 done" }));
      const first = completions.splice(0);
      await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Task 3 done" }));
      await show(without(all, "task-1", "task-3"));
      await act(async () => {
        for (const done of first) {
          done(true);
        }
        await Promise.resolve();
      });
      expect(titles()).toEqual(["Task 0", "Task 2", "Task 3", "Task 4"]);
    });

    it("shows a row at once, unchecked, when an undo brings it back while it leaves", async () => {
      const { all, show } = await leavingList();
      await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Task 1 done" }));
      await show(without(all, "task-1"));
      await show(all);
      expect(screen.getByRole("checkbox", { name: "Mark Task 1 done" })).not.toBeChecked();
    });

    it("leaves again after a refused close, without the row coming back while the next close waits", async () => {
      const { all, close, finishAnimations, show } = await leavingList();
      const refused = Promise.withResolvers<{ error: "persist_failed"; ok: false }>();
      close.mockReturnValueOnce(refused.promise);
      await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Task 1 done" }));
      // The close showed (the store dropped the row), then its write was refused: it is back.
      await show(without(all, "task-1"));
      await act(async () => {
        refused.resolve({ error: "persist_failed", ok: false });
        await Promise.resolve();
      });
      await show(all);
      await finishAnimations();
      expect(screen.getByRole("checkbox", { name: "Mark Task 1 done" })).not.toBeChecked();
      // Checked again, the close waits in the queue past the animation: the row stays gone.
      const held = Promise.withResolvers<{ ok: true; value: [] }>();
      close.mockReturnValueOnce(held.promise);
      await fireEvent.press(screen.getByRole("checkbox", { name: "Mark Task 1 done" }));
      await finishAnimations();
      expect(screen.queryByText("Task 1")).toBeNull();
      await act(async () => {
        held.resolve({ ok: true, value: [] });
        await Promise.resolve();
      });
    });
  });
});
