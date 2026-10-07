import {
  type CoreState,
  minutesBetween,
  type QueryContext,
  type ReviewActionKey,
  type ReviewItem,
  reviewItems,
  type ReviewKind,
  taskById,
} from "@pace/core";

export type ReviewRow = {
  /** The core item, handed back to `runReviewAction`. */
  readonly item: ReviewItem;
  readonly kind: ReviewKind;
  readonly taskId: string;
  readonly title: string;
  readonly since: string;
  readonly sinceMinutes: number;
  readonly actions: readonly ReviewActionKey[];
};

export type ReviewViewModel = {
  readonly count: number;
  readonly items: readonly ReviewRow[];
};

export const reviewViewModel = (state: CoreState, ctx: QueryContext): ReviewViewModel => {
  const items = reviewItems(state, ctx).map((item) => ({
    item,
    kind: item.kind,
    taskId: item.taskId,
    title: taskById(state.tasks, item.taskId)?.title ?? item.taskId,
    since: item.since,
    sinceMinutes: minutesBetween(item.since, ctx.now),
    actions: item.actions.map((action) => action.key),
  }));
  return { count: items.length, items };
};
