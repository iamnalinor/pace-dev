import {
  err,
  type EventInput,
  findProjectByName,
  newId,
  ok,
  projectById,
  type Result,
} from "@pace/core";

import { type ActionDeps, stamp, type When } from "./deps.ts";

/** A project by id, or by name: an unknown name creates the project on the fly. */
export type ProjectTarget = { readonly projectId: string } | { readonly projectName: string };

export type ResolvedProject = {
  readonly projectId: string;
  /** The creation to append first when the name was new. */
  readonly events: readonly EventInput[];
};

/**
"Project on the fly": a name reuses the existing project whatever its case and spacing,
otherwise a `project.created` precedes the task's own event, at the same instant.
*/
export const resolveProject = (
  deps: ActionDeps,
  target: ProjectTarget,
  when: When = {},
): Result<ResolvedProject, "action/invalid-input" | "action/unknown-project"> => {
  const { projects } = deps.state.store.getState();
  if ("projectId" in target) {
    return projectById(projects, target.projectId) === undefined
      ? err("action/unknown-project")
      : ok({ projectId: target.projectId, events: [] });
  }
  const name = target.projectName.trim();
  if (name === "") {
    return err("action/invalid-input");
  }
  const existing = findProjectByName(projects, name);
  if (existing !== undefined) {
    return ok({ projectId: existing.id, events: [] });
  }
  const projectId = newId();
  return ok({
    projectId,
    events: [stamp(deps, { type: "project.created", payload: { projectId, name } }, when)],
  });
};
