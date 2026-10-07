import { describe, expect, it } from "vitest";

import {
  findProjectByName,
  INITIAL_PROJECTS_STATE,
  type Project,
  projectById,
  type ProjectsState,
} from "./project.ts";

const project = (id: string, name: string, archived = false): Project => ({
  id,
  name,
  color: null,
  description: null,
  archived,
  createdAt: "2026-10-05T07:00:00.000Z",
});

const stateWith = (...projects: readonly Project[]): ProjectsState => ({
  byId: Object.fromEntries(projects.map((item) => [item.id, item])),
});

describe("INITIAL_PROJECTS_STATE", () => {
  it("has no projects", () => {
    expect(INITIAL_PROJECTS_STATE).toEqual({ byId: {} });
  });
});

describe("projectById", () => {
  it("finds own entries only", () => {
    const state = stateWith(project("p1", "Algebra"));
    expect(projectById(state, "p1")?.name).toBe("Algebra");
    expect(projectById(state, "toString")).toBeUndefined();
  });
});

describe("findProjectByName", () => {
  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const state = stateWith(project("p1", "Algebra"), project("p2", "Work"));
    expect(findProjectByName(state, "  algebra ")?.id).toBe("p1");
    expect(findProjectByName(state, "WORK")?.id).toBe("p2");
  });

  it("returns undefined when nothing matches", () => {
    expect(findProjectByName(stateWith(project("p1", "Algebra")), "History")).toBeUndefined();
    expect(findProjectByName(INITIAL_PROJECTS_STATE, "")).toBeUndefined();
  });

  it("prefers an active project over an archived namesake", () => {
    const state = stateWith(project("old", "Algebra", true), project("new", "Algebra"));
    expect(findProjectByName(state, "Algebra")?.id).toBe("new");
    const archivedOnly = stateWith(project("old", "Algebra", true));
    expect(findProjectByName(archivedOnly, "Algebra")?.id).toBe("old");
  });
});
