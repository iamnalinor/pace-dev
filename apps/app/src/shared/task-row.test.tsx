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

const renderRow = async (selectedId: null | string) => {
  await renderScreen(
    <TaskOpenerProvider open={jest.fn()} selectedId={selectedId}>
      <TaskRow onOpen={jest.fn()} row={ROW} />
    </TaskOpenerProvider>,
    await createTestRuntime({ world: "empty" }),
  );
};

describe("TaskRow", () => {
  it("draws its selection on the ground its whole meta line was measured on (bug-lessons 112)", async () => {
    await renderRow(ROW.id);
    const open = screen.getByRole("link", { name: /Write the intro/u });
    expect(open).toHaveProp("aria-current", "page");
    // USED_PAIRS measures the tertiary times, danger words and every tag on this fill.
    const box = screen.getByTestId("list-row-control").parent;
    expect(String(box?.props["className"])).toContain(`bg-${SELECTED_ROW_FILL.replace(".", "-")}`);
  });

  it("has no ground of its own while it is not the open task", async () => {
    await renderRow(null);
    const box = screen.getByTestId("list-row-control").parent;
    expect(
      String(box?.props["className"])
        .split(" ")
        .filter((name) => name.startsWith("bg-")),
    ).toEqual([]);
  });

  it("marks the row so the web hovers it whole, check and all (design review 2 N7)", async () => {
    await renderRow(ROW.id);
    const box = screen.getByTestId("list-row-control").parent;
    expect(box?.props["dataSet"]).toEqual({ paceRow: "true" });
  });

  it("keeps the check beside the press area, never inside it", async () => {
    await renderRow(null);
    const check = screen.getByRole("checkbox");
    const open = screen.getByRole("link", { name: /Write the intro/u });
    expect(open).not.toContainElement(check);
  });
});
