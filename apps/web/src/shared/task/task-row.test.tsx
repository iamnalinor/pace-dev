import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NowRow } from "@pace/client";

import { frozenServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { HW_DUE, MOSCOW } from "@pace/core/testing";

import { TaskRow } from "./task-row.tsx";

const hw: NowRow = {
  color: "blue",
  tag: { kind: "project", name: "Algebra" },
  dimmed: false,
  id: "t-hw",
  importance: "normal",
  meta: [
    { at: HW_DUE, kind: "due", relative: "tomorrow", tz: MOSCOW, zoneDiffers: false },
    { kind: "solved", solved: 4, total: 7 },
    { kind: "sent", submitted: 2 },
  ],
  paceExpected: 0.82,
  progress: 4 / 7,
  projectId: "p-algebra",
  title: "Algebra HW 6",
};

const books: NowRow = {
  ...hw,
  color: "green",
  dimmed: true,
  id: "t-books",
  importance: "nice_to_have",
  meta: [
    { importance: "nice_to_have", kind: "importance" },
    { kind: "age", minutes: 12 * 24 * 60 },
  ],
  paceExpected: null,
  progress: 0,
  title: "Return library books",
};

const renderRow = (ui: React.ReactElement) =>
  renderWithProviders(<ul>{ui}</ul>, { services: frozenServices().services });

describe("TaskRow", () => {
  it("links the title to the task and reads the meta line from the view-model", async () => {
    renderRow(<TaskRow onCheck={vi.fn()} row={hw} />);
    const link = await screen.findByRole("link", { name: /Algebra HW 6/ });
    expect(link).toHaveAttribute("href", "/task/t-hw");
    expect(link).toHaveTextContent("Due tomorrow 23:59 · 4/7 solved · 2 sent");
    expect(screen.getByTestId("pace-marker")).toHaveStyle({ left: "82%" });
  });

  it("checks the task with its primary action", async () => {
    const onCheck = vi.fn();
    const { user } = renderRow(<TaskRow onCheck={onCheck} row={hw} />);
    await user.click(await screen.findByRole("button", { name: "Mark Algebra HW 6 done" }));
    expect(onCheck).toHaveBeenCalledWith(hw);
  });

  it("dims a Nice-to-have without a due and draws no bar when nothing is done or paced", async () => {
    renderRow(<TaskRow row={books} />);
    const item = await screen.findByRole("listitem");
    // Quiet by a lighter title, not by transparency: the text keeps its AA contrast.
    expect(screen.getByText("Return library books")).toHaveClass("text-fg2");
    // The category and the importance are tags in their colours, then the plain meta.
    expect(item).toHaveTextContent(/Nice-to-have12d old/u);
    expect(screen.queryByTestId("pace-marker")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reads relative days against the instant it is given", async () => {
    renderRow(<TaskRow now="2026-10-07T09:00:00.000Z" row={hw} />);
    expect(await screen.findByRole("link")).toHaveTextContent(/Due today 23:59/);
  });
});
