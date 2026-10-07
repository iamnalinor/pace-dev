import { useMemo } from "react";

import type { ProjectColorName } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { projectViewModel } from "@pace/client";

export type ProjectSummary = {
  readonly id: string;
  readonly name: string;
  readonly color: null | ProjectColorName;
  readonly archived: boolean;
  readonly open: number;
  readonly onTime: { readonly done: number; readonly total: number };
};

const byName = (a: ProjectSummary, b: ProjectSummary): number => a.name.localeCompare(b.name);

/** Every project with the header figures of its page; active ones first, then by name. */
export const useProjectSummaries = (): readonly ProjectSummary[] => {
  const { hooks } = useServices();
  const state = hooks.useAppState((current) => current);
  const ctx = hooks.useClock();
  return useMemo(
    () =>
      Object.values(state.projects.byId)
        .flatMap((project) => {
          const view = projectViewModel(state, project.id, ctx);
          return view.ok
            ? [
                {
                  archived: project.archived,
                  color: project.color,
                  id: project.id,
                  name: project.name,
                  onTime: view.value.stats.onTime,
                  open: view.value.stats.open,
                },
              ]
            : [];
        })
        .toSorted((a, b) =>
          a.archived === b.archived ? byName(a, b) : Number(a.archived) - Number(b.archived),
        ),
    [state, ctx],
  );
};
