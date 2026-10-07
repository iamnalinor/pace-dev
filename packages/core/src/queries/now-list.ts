import type { CoreState } from "../materialize/core-state.ts";
import type { QueryContext } from "./context.ts";

import { isOpen, type Task } from "../model/task.ts";
import { isEmptyInstance, isInboxTask } from "./classify.ts";
import { compareNowItems, type NowItem, nowItem } from "./now-item.ts";

export type { NowItem } from "./now-item.ts";

/** The Now screen: what to do, what waits on someone else, and how much is folded away. */
export type NowList = {
  /** Open, visible, not waiting; best score first. */
  readonly items: readonly NowItem[];
  /** Open tasks waiting on someone else, with their frozen scores. */
  readonly waiting: readonly NowItem[];
  /** Hidden for now: future starts and empty recurring instances awaiting an assignment. */
  readonly laterCount: number;
  /** Open inbox items, whatever the project filter: the counter in the header. */
  readonly inboxCount: number;
};

export type NowListOptions = {
  readonly projectId?: string;
};

type Section = "items" | "later" | "waiting";

type Placed = {
  readonly section: Section;
  readonly item: NowItem;
};

/** Empty instances have no score, so they are folded into "later" before scoring. */
const place = (state: CoreState, task: Task, ctx: QueryContext): readonly Placed[] => {
  const scored = nowItem(state, task, ctx);
  if (!scored.ok) {
    return [];
  }
  if (scored.value.score.hidden) {
    return [{ section: "later", item: scored.value }];
  }
  return [{ section: task.status === "waiting" ? "waiting" : "items", item: scored.value }];
};

const inSection = (placed: readonly Placed[], section: Section): readonly NowItem[] =>
  placed
    .filter((entry) => entry.section === section)
    .map((entry) => entry.item)
    .toSorted(compareNowItems);

/**
The Now list over the open tasks (of one project when a filter is given). A task whose
preset cannot be resolved is left out rather than scored wrongly; the preset editor
prevents that state, so it only arises from a hand-edited log.
*/
export const nowList = (state: CoreState, ctx: QueryContext, options?: NowListOptions): NowList => {
  const open = Object.values(state.tasks.byId).filter(isOpen);
  const inScope = open.filter(
    (task) =>
      !isInboxTask(task) &&
      (options?.projectId === undefined || task.projectId === options.projectId),
  );
  const empty = inScope.filter((task) => isEmptyInstance(task));
  const placed = inScope
    .filter((task) => !isEmptyInstance(task))
    .flatMap((task) => place(state, task, ctx));
  return {
    items: inSection(placed, "items"),
    waiting: inSection(placed, "waiting"),
    laterCount: empty.length + placed.filter((entry) => entry.section === "later").length,
    inboxCount: open.filter((task) => isInboxTask(task)).length,
  };
};
