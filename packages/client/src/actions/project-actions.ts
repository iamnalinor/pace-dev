import {
  err,
  findProjectByName,
  newId,
  projectById,
  type ProjectColorName,
  type ProjectsState,
} from "@pace/core";

import { type ActionDeps, type ActionResult, emit, type ProjectNameError, stamp } from "./deps.ts";

export type ProjectDraft = { readonly name: string; readonly color: ProjectColorName };

export type ProjectPatch = Partial<ProjectDraft> & {
  readonly description?: string;
  readonly archived?: boolean;
};

export type ProjectActions = {
  readonly createProject: (draft: ProjectDraft) => ActionResult;
  /** An empty description clears it; `archived` archives or restores. */
  readonly updateProject: (projectId: string, patch: ProjectPatch) => ActionResult;
};

/**
Why a name cannot be used: empty, or already carried by another active project (the lookup
ignores case and spacing, as "project on the fly" does). `null` when it is fine.
*/
export const projectNameError = (
  projects: ProjectsState,
  name: string,
  selfId?: string,
): null | ProjectNameError => {
  if (name.trim() === "") {
    return "project/name-required";
  }
  const existing = findProjectByName(projects, name);
  return existing !== undefined && !existing.archived && existing.id !== selfId
    ? "project/name-taken"
    : null;
};

const patchPayload = (projectId: string, patch: ProjectPatch) => {
  const description = patch.description?.trim();
  return {
    projectId,
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.color !== undefined && { color: patch.color }),
    ...(description !== undefined && { description: description === "" ? null : description }),
    ...(patch.archived !== undefined && { archived: patch.archived }),
  };
};

export const projectActions = (deps: ActionDeps): ProjectActions => ({
  createProject: async ({ color, name }) => {
    const problem = projectNameError(deps.state.store.getState().projects, name);
    if (problem !== null) {
      return err(problem);
    }
    const payload = { color, name: name.trim(), projectId: newId() };
    return await emit(deps, [stamp(deps, { payload, type: "project.created" })]);
  },
  updateProject: async (projectId, patch) => {
    const { projects } = deps.state.store.getState();
    if (projectById(projects, projectId) === undefined) {
      return err("action/unknown-project");
    }
    const problem =
      patch.name === undefined ? null : projectNameError(projects, patch.name, projectId);
    if (problem !== null) {
      return err(problem);
    }
    return await emit(deps, [
      stamp(deps, { payload: patchPayload(projectId, patch), type: "project.updated" }),
    ]);
  },
});
