import type { ProjectColorName } from "../design/tokens.ts";

/** A project is a tag: a task belongs to at most one, independently of its preset. */
export type Project = {
  readonly id: string;
  readonly name: string;
  readonly color: null | ProjectColorName;
  readonly description: null | string;
  readonly archived: boolean;
  readonly createdAt: string;
};

export type ProjectsState = { readonly byId: Readonly<Record<string, Project>> };

export const INITIAL_PROJECTS_STATE: ProjectsState = { byId: {} };

/** Own-property lookup: a project id must never resolve to something on `Object.prototype`. */
export const projectById = (state: ProjectsState, id: string): Project | undefined =>
  Object.hasOwn(state.byId, id) ? state.byId[id] : undefined;

const nameKey = (name: string): string => name.trim().toLowerCase();

/**
 * "Project on the fly": a task bound to a project by name reuses the existing one. An
 * active project wins over an archived namesake, so archiving frees the name.
 */
export const findProjectByName = (state: ProjectsState, name: string): Project | undefined => {
  const key = nameKey(name);
  const matches = Object.values(state.byId).filter((project) => nameKey(project.name) === key);
  return matches.find((project) => !project.archived) ?? matches[0];
};
