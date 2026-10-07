import type { PaceServices } from "#web/services.ts";

import {
  findProjectByName,
  type MessageKey,
  newId,
  type ProjectColorName,
  type ProjectsState,
} from "@pace/core";

export type ProjectDraft = {
  readonly name: string;
  readonly color: ProjectColorName;
  readonly description: string;
};

/**
Why a name cannot be used: empty, or already carried by another active project (the
lookup ignores case and spacing, as "project on the fly" does). `null` when it is fine.
*/
export const projectNameProblem = (
  projects: ProjectsState,
  name: string,
  selfId?: string,
): MessageKey | null => {
  if (name.trim() === "") {
    return "projects.nameRequired";
  }
  const existing = findProjectByName(projects, name);
  return existing !== undefined && !existing.archived && existing.id !== selfId
    ? "projects.nameTaken"
    : null;
};

/*
The client has no project actions yet, so the two project events are dispatched here,
with the client's clock; the store validates them like any other event.
*/

export const createProject = async (
  { clock, state }: PaceServices,
  draft: Pick<ProjectDraft, "color" | "name">,
): Promise<null | string> => {
  const projectId = newId();
  const result = await state.dispatch({
    occurredAt: clock.now(),
    payload: { color: draft.color, name: draft.name.trim(), projectId },
    type: "project.created",
  });
  return result.ok ? projectId : null;
};

export const updateProject = async (
  { clock, state }: PaceServices,
  projectId: string,
  patch: Partial<ProjectDraft> & { readonly archived?: boolean },
): Promise<boolean> => {
  const description = patch.description?.trim();
  const result = await state.dispatch({
    occurredAt: clock.now(),
    payload: {
      projectId,
      ...(patch.name !== undefined && { name: patch.name.trim() }),
      ...(patch.color !== undefined && { color: patch.color }),
      ...(description !== undefined && { description: description === "" ? null : description }),
      ...(patch.archived !== undefined && { archived: patch.archived }),
    },
    type: "project.updated",
  });
  return result.ok;
};
