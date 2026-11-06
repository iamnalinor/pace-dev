import { fireEvent, screen, waitFor } from "@testing-library/react-native";

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
});
