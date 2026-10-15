import { describe, expect, it } from "vitest";

import { ALGEBRA_ID, artboardState, CALCULUS_ID, WORK_ID } from "@pace/core/testing";

import { openTasksLabel, projectsViewModel } from "./projects.ts";

const withOnlyProject = (projectId: string) => {
  const state = artboardState();
  return {
    ...state,
    tasks: {
      ...state.tasks,
      byId: Object.fromEntries(
        Object.entries(state.tasks.byId).filter(([, task]) => task.projectId === projectId),
      ),
    },
  };
};

describe("projectsViewModel", () => {
  it("counts each project's open tasks, by name", () => {
    expect(projectsViewModel(artboardState())).toEqual([
      { color: "blue", id: ALGEBRA_ID, name: "Algebra", open: 2 },
      { color: "teal", id: CALCULUS_ID, name: "Calculus", open: 2 },
      expect.objectContaining({ id: WORK_ID, name: "Work", open: 3 }),
    ]);
  });

  it("still counts when the Now filter offers no chips: one project holding every open task", () => {
    const rows = projectsViewModel(withOnlyProject(WORK_ID));
    expect(rows.find((row) => row.id === WORK_ID)?.open).toBe(3);
  });

  it("counts a project without open tasks as zero, and leaves archived projects out", () => {
    const state = withOnlyProject(WORK_ID);
    const rows = projectsViewModel(state);
    expect(rows.find((row) => row.id === ALGEBRA_ID)?.open).toBe(0);
    const algebra = state.projects.byId[ALGEBRA_ID];
    if (algebra === undefined) {
      throw new Error("the artboard has Algebra");
    }
    const archived = {
      ...state,
      projects: {
        ...state.projects,
        byId: { ...state.projects.byId, [ALGEBRA_ID]: { ...algebra, archived: true } },
      },
    };
    expect(projectsViewModel(archived).map((row) => row.id)).not.toContain(ALGEBRA_ID);
  });

  it("does not count the Inbox or closed tasks", () => {
    const rows = projectsViewModel(artboardState());
    const total = rows.reduce((sum, row) => sum + row.open, 0);
    const open = Object.values(artboardState().tasks.byId).filter(
      (task) => task.closed === null && task.presetId !== "inbox" && task.projectId !== null,
    );
    expect(total).toBe(open.length);
  });
});

describe("openTasksLabel", () => {
  it("says how many tasks are open, or that none are", () => {
    expect(openTasksLabel("en", 0)).toBe("No open tasks");
    expect(openTasksLabel("en", 1)).toBe("1 task");
    expect(openTasksLabel("en", 3)).toBe("3 tasks");
  });

  it("declines the Russian noun", () => {
    expect(openTasksLabel("ru", 0)).toBe("Нет открытых задач");
    expect(openTasksLabel("ru", 1)).toBe("1 задача");
    expect(openTasksLabel("ru", 3)).toBe("3 задачи");
    expect(openTasksLabel("ru", 5)).toBe("5 задач");
    expect(openTasksLabel("ru", 21)).toBe("21 задача");
  });
});
