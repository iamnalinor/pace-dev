import {
  type CoreState,
  isInboxTask,
  isOpen,
  type Language,
  plural,
  type ProjectColorName,
  t,
} from "@pace/core";

/** One line of the projects list. */
export type ProjectListRow = {
  readonly id: string;
  readonly name: string;
  readonly color: null | ProjectColorName;
  /** Open tasks in the project, as Now counts them (the Inbox is a list of its own). */
  readonly open: number;
};

/**
Every active project by name with its open tasks. Counted from the tasks themselves, not from
Now's filter chips, which leave out projects without open tasks and all of them when they
could not narrow the list.
*/
export const projectsViewModel = (state: CoreState): readonly ProjectListRow[] => {
  const openIn = (projectId: string): number =>
    Object.values(state.tasks.byId).filter(
      (task) => task.projectId === projectId && isOpen(task) && !isInboxTask(task),
    ).length;
  return Object.values(state.projects.byId)
    .filter((project) => !project.archived)
    .map((project) => ({
      color: project.color,
      id: project.id,
      name: project.name,
      open: openIn(project.id),
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
};

/** "3 tasks", "1 task", "No open tasks": what a project's line says about its open tasks. */
export const openTasksLabel = (language: Language, count: number): string =>
  count === 0
    ? t(language, "projects.open.none")
    : plural(language, count, {
        few: t(language, "projects.open.few"),
        many: t(language, "projects.open.many"),
        one: t(language, "projects.open.one"),
        other: t(language, "projects.open.other"),
      });
