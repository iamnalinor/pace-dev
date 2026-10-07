import type { Reducer } from "./materializer.ts";

import { INITIAL_PROJECTS_STATE, type ProjectsState } from "../model/project.ts";
import { DEFAULT_SETTINGS, type Settings } from "../model/settings.ts";
import { INITIAL_TASKS_STATE, type TasksState } from "../model/task.ts";
import {
  INITIAL_PRESETS_STATE,
  presetReducer,
  type PresetsState,
} from "../presets/preset-reducer.ts";
import { projectReducer } from "./project-reducer.ts";
import { settingsReducer } from "./settings-reducer.ts";
import { taskReducer } from "./task-reducer.ts";

/**
Everything the queries read: the four materialized slices. The Durable Object folds the
log with `coreReducer`; the client composes the same slices itself and passes them on.
*/
export type CoreState = {
  readonly tasks: TasksState;
  readonly projects: ProjectsState;
  readonly presets: PresetsState;
  readonly settings: Settings;
};

export const INITIAL_CORE_STATE: CoreState = {
  tasks: INITIAL_TASKS_STATE,
  projects: INITIAL_PROJECTS_STATE,
  presets: INITIAL_PRESETS_STATE,
  settings: DEFAULT_SETTINGS,
};

/** One event touches at most one slice; the untouched slices (and the whole state) keep their references. */
export const coreReducer: Reducer<CoreState> = (state, event) => {
  const next: CoreState = {
    tasks: taskReducer(state.tasks, event),
    projects: projectReducer(state.projects, event),
    presets: presetReducer(state.presets, event),
    settings: settingsReducer(state.settings, event),
  };
  const isSame =
    next.tasks === state.tasks &&
    next.projects === state.projects &&
    next.presets === state.presets &&
    next.settings === state.settings;
  return isSame ? state : next;
};
