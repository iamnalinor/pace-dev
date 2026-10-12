import type { CoreState } from "../materialize/core-state.ts";
import type { QueryContext } from "./context.ts";

import { isOpen } from "../model/task.ts";
import { isInboxTask } from "./classify.ts";
import {
  compareFutureItems,
  compareNowItems,
  hasLaterStart,
  type NowItem,
  nowItem,
} from "./now-item.ts";

export type { NowItem } from "./now-item.ts";

/** The Now screen: open tasks by deadline, and the ones that start later. */
export type NowList = {
  /** Open tasks that have started (or have no start), the nearest deadline first. */
  readonly items: readonly NowItem[];
  /** Open tasks whose start is still ahead, the earliest start first: folded under "In future". */
  readonly future: readonly NowItem[];
  /** Open inbox items, whatever the project filter: the counter in the header. */
  readonly inboxCount: number;
};

export type NowListOptions = {
  readonly projectId?: string;
};

/**
The Now list over the open tasks (of one project when a filter is given). A task whose
preset cannot be resolved is left out; the preset editor prevents that state, so it only
arises from a hand-edited log. Weekly instances show up as soon as they are issued, filled
in or not, so the week's plan is visible before the homework text arrives.
*/
export const nowList = (state: CoreState, ctx: QueryContext, options?: NowListOptions): NowList => {
  const open = Object.values(state.tasks.byId).filter(isOpen);
  const rows = open
    .filter(
      (task) =>
        !isInboxTask(task) &&
        (options?.projectId === undefined || task.projectId === options.projectId),
    )
    .flatMap((task) => {
      const item = nowItem(state, task, ctx);
      return item.ok ? [item.value] : [];
    });
  return {
    items: rows.filter((item) => !hasLaterStart(item.task, ctx.now)).toSorted(compareNowItems),
    future: rows.filter((item) => hasLaterStart(item.task, ctx.now)).toSorted(compareFutureItems),
    inboxCount: open.filter((task) => isInboxTask(task)).length,
  };
};
