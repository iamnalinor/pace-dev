import type { EventOf } from "../events/event-schema.ts";
import type { Reducer } from "./materializer.ts";

import { type Project, projectById, type ProjectsState } from "../model/project.ts";

const put = (state: ProjectsState, project: Project): ProjectsState => ({
  byId: { ...state.byId, [project.id]: project },
});

/** A second creation for an existing id is a no-op (projects are created on the fly by name). */
const created = (state: ProjectsState, event: EventOf<"project.created">): ProjectsState => {
  const { projectId, name, color = null, description = null } = event.payload;
  if (projectById(state, projectId) !== undefined) {
    return state;
  }
  return put(state, {
    id: projectId,
    name,
    color,
    description,
    archived: false,
    createdAt: event.occurredAt,
  });
};

const isSame = (a: Project, b: Project): boolean =>
  a.name === b.name &&
  a.color === b.color &&
  a.description === b.description &&
  a.archived === b.archived;

/** Patches the given keys; `description: null` clears it. */
const updated = (state: ProjectsState, event: EventOf<"project.updated">): ProjectsState => {
  const { projectId, name, color, description, archived } = event.payload;
  const current = projectById(state, projectId);
  if (current === undefined) {
    return state;
  }
  const next: Project = {
    ...current,
    name: name ?? current.name,
    color: color ?? current.color,
    description: description === undefined ? current.description : description,
    archived: archived ?? current.archived,
  };
  return isSame(next, current) ? state : put(state, next);
};

export const projectReducer: Reducer<ProjectsState> = (state, event) => {
  if (event.type === "project.created") {
    return created(state, event);
  }
  return event.type === "project.updated" ? updated(state, event) : state;
};
