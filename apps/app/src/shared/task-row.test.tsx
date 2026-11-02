import { screen } from "@testing-library/react-native";

import type { NowRow } from "@pace/client";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { SELECTED_ROW_FILL } from "@pace/core";

import { TaskOpenerProvider } from "./task-opener.tsx";
import { TaskRow } from "./task-row.tsx";

const ROW: NowRow = {
  color: "green",
  dimmed: false,
  dueAt: null,
  id: "task-1",
  importance: "normal",
  meta: [{ kind: "importance", importance: "normal" }],
  progress: 0,
  projectId: null,
  tag: { kind: "project", name: "Thesis" },
  title: "Write the intro",
};

/** The row's own box: the parent of the link that opens the task. */
const rowClasses = (): readonly string[] => {
  const link = screen.getByRole("link", { name: /Write the intro/u });
  return String(link.parent?.props["className"] ?? "").split(" ");
};

const renderRow = async (selectedId: null | string) => {
  await renderScreen(
    <TaskOpenerProvider open={jest.fn()} selectedId={selectedId}>
      <TaskRow onOpen={jest.fn()} row={ROW} />
    </TaskOpenerProvider>,
    await createTestRuntime({ world: "empty" }),
  );
};

describe("TaskRow", () => {
  it("draws its selection on the ground its whole meta line was measured on (bug-lessons 61)", async () => {
    await renderRow(ROW.id);
    expect(screen.getByRole("link", { name: /Write the intro/u })).toHaveProp(
      "aria-current",
      "page",
    );
    // USED_PAIRS measures the tertiary times, danger words and every tag on this fill.
    expect(rowClasses()).toContain(`bg-${SELECTED_ROW_FILL.replace(".", "-")}`);
  });

  it("has no ground of its own while it is not the open task", async () => {
    await renderRow(null);
    expect(rowClasses().filter((name) => name.startsWith("bg-"))).toEqual([]);
  });
});
