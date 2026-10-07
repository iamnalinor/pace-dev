import { err, type Importance, rankWithinCategory, resolvePreset, type Task } from "@pace/core";

import type { AppState } from "../state.ts";

import { type ActionDeps, type ActionResult, emit, stamp } from "./deps.ts";

export type RankActions = {
  /** Moves the task to the 1-based position inside its importance category and renumbers the rest. */
  readonly setRank: (taskId: string, position: number) => ActionResult;
};

const importanceOf = (state: AppState, task: Task): Importance | undefined => {
  const preset = resolvePreset(state.presets, task.presetId, task.overrides ?? undefined);
  return preset.ok ? (task.importance ?? preset.value.defaultImportance) : undefined;
};

type Member = { readonly task: Task; readonly position: number };

/** The competing tasks of the task's category in their current order; empty when it does not compete. */
const categoryOf = (state: AppState, task: Task): readonly Task[] => {
  const importance = importanceOf(state, task);
  return Object.values(state.tasks.byId)
    .filter((candidate) => importanceOf(state, candidate) === importance)
    .flatMap((candidate): readonly Member[] => {
      const rank = rankWithinCategory(state, candidate);
      return rank === null ? [] : [{ task: candidate, position: rank.position }];
    })
    .toSorted((a, b) => a.position - b.position)
    .map((member) => member.task);
};

const moved = (category: readonly Task[], task: Task, position: number): readonly Task[] => {
  const others = category.filter((member) => member.id !== task.id);
  const index = Math.min(Math.max(position, 1), category.length) - 1;
  return [...others.slice(0, index), task, ...others.slice(index)];
};

export const rankActions = (deps: ActionDeps): RankActions => ({
  setRank: async (taskId, position) => {
    const state = deps.state.store.getState();
    const task = state.tasks.byId[taskId];
    const category = task === undefined ? [] : categoryOf(state, task);
    if (task === undefined || category.every((member) => member.id !== taskId)) {
      return err("action/nothing-to-do");
    }
    const changes = moved(category, task, position).flatMap((member, index) =>
      member.rank === index + 1
        ? []
        : [stamp(deps, { type: "task.rank.set", payload: { taskId: member.id, rank: index + 1 } })],
    );
    return await emit(deps, changes);
  },
});
