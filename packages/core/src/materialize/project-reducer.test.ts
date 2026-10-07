import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";

import { INITIAL_PROJECTS_STATE, type ProjectsState } from "../model/project.ts";
import { materialize } from "./materializer.ts";
import { projectReducer } from "./project-reducer.ts";
import { at } from "./task-fixture.fake.ts";

const T = (hour: number): string => `2026-10-05T${String(hour).padStart(2, "0")}:00:00.000Z`;

const created = (
  index: number,
  payload: {
    readonly projectId: string;
    readonly name: string;
    readonly color?: "blue" | "teal";
    readonly description?: string;
  },
): Event => at(index, T(index), { type: "project.created", payload });

const updated = (
  index: number,
  payload: {
    readonly projectId: string;
    readonly name?: string;
    readonly color?: "blue" | "teal";
    readonly description?: null | string;
    readonly archived?: boolean;
  },
): Event => at(index, T(index), { type: "project.updated", payload });

const fold = (events: readonly Event[]): ProjectsState =>
  materialize(events, projectReducer, INITIAL_PROJECTS_STATE);

describe("projectReducer: project.created", () => {
  it("adds a project with defaults and the event's occurredAt as createdAt", () => {
    expect(fold([created(1, { projectId: "p1", name: "Algebra" })]).byId["p1"]).toEqual({
      id: "p1",
      name: "Algebra",
      color: null,
      description: null,
      archived: false,
      createdAt: T(1),
    });
  });

  it("keeps the given colour and description", () => {
    const state = fold([
      created(1, { projectId: "p1", name: "Algebra", color: "teal", description: "Linear" }),
    ]);
    expect(state.byId["p1"]).toMatchObject({ color: "teal", description: "Linear" });
  });

  it("ignores a second creation for an existing id", () => {
    const state = fold([created(1, { projectId: "p1", name: "Algebra" })]);
    const again = created(2, { projectId: "p1", name: "Renamed" });
    expect(projectReducer(state, again)).toBe(state);
  });
});

describe("projectReducer: project.updated", () => {
  const base = created(1, { projectId: "p1", name: "Algebra", description: "Linear" });

  it("patches name, colour, description and archived", () => {
    const state = fold([
      base,
      updated(2, { projectId: "p1", name: "Algebra I", color: "blue", archived: true }),
    ]);
    expect(state.byId["p1"]).toMatchObject({
      name: "Algebra I",
      color: "blue",
      description: "Linear",
      archived: true,
    });
  });

  it("clears the description with null", () => {
    const state = fold([base, updated(2, { projectId: "p1", description: null })]);
    expect(state.byId["p1"]?.description).toBeNull();
  });

  it("ignores unknown projects and no-op patches", () => {
    const state = fold([base]);
    expect(projectReducer(state, updated(2, { projectId: "nope", name: "x" }))).toBe(state);
    expect(projectReducer(state, updated(3, { projectId: "p1", name: "Algebra" }))).toBe(state);
  });
});

describe("projectReducer: other events", () => {
  it("leaves the state untouched", () => {
    const other = at(1, T(1), { type: "task.reopened", payload: { taskId: "t" } });
    expect(projectReducer(INITIAL_PROJECTS_STATE, other)).toBe(INITIAL_PROJECTS_STATE);
  });
});
