import {
  err,
  type Event,
  findProjectByName,
  newId,
  projectById,
  type ProjectColorName,
  type ProjectsState,
} from "@pace/core";

import {
  type ActionDeps,
  type ActionResult,
  emit,
  type ProjectNameError,
  stamp,
  withCompleteHistory,
} from "./deps.ts";

export type ProjectDraft = { readonly name: string; readonly color: ProjectColorName };

export type ProjectPatch = Partial<ProjectDraft> & {
  readonly description?: string;
  readonly archived?: boolean;
};

export type ProjectActions = {
  readonly createProject: (draft: ProjectDraft) => ActionResult;
  /** An empty description clears it; `archived` archives or restores. */
  readonly updateProject: (projectId: string, patch: ProjectPatch) => ActionResult;
  /**
  The archive toast's Undo: revokes `archiveId` while it is the archive in effect, else writes
  nothing (`action/nothing-to-do`): restored another way, archived again, or revoked already (QA
  round 28 R28-02). Checked in the write queue (class 222).
  */
  readonly undoArchive: (projectId: string, archiveId: string) => ActionResult;
};

/**
The event in effect that archived the project, while it is archived: the last of its events in
effect that set `archived`, when that set it to true. An archive toast stands while it is its own.
*/
export const archiveInEffect = (events: readonly Event[], projectId: string): null | string => {
  const last = events.findLast(
    (event) =>
      event.type === "project.updated" &&
      event.payload.projectId === projectId &&
      event.payload.archived !== undefined,
  );
  return last?.type === "project.updated" && last.payload.archived === true ? last.id : null;
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
  return existing === undefined || existing.archived || existing.id === selfId
    ? null
    : "project/name-taken";
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
  // A revocation needs the source: the archive may sit in a checkpoint's base. The archive in
  // effect is read after that wait, in the write queue (classes 118, 222).
  undoArchive: withCompleteHistory(
    deps,
    async (projectId: string, archiveId: string) =>
      await emit(
        deps,
        [stamp(deps, { payload: { targetId: archiveId }, type: "event.revoked" })],
        () =>
          archiveInEffect(deps.state.store.getState().events, projectId) === archiveId
            ? null
            : "action/nothing-to-do",
      ),
  ),
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
    // An archive or a restore it already is writes nothing, asked in the write queue (class 222).
    const isAlready = (): boolean =>
      patch.archived !== undefined &&
      Object.keys(patch).length === 1 &&
      projectById(deps.state.store.getState().projects, projectId)?.archived === patch.archived;
    return await emit(
      deps,
      [stamp(deps, { payload: patchPayload(projectId, patch), type: "project.updated" })],
      () => (isAlready() ? "action/nothing-to-do" : null),
    );
  },
});
