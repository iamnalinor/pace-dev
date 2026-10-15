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

/**
The decisions the rules want from the person: every row but "unsorted too long", whose capture
already has its own card in the Inbox. What the Inbox lists under its cards and what its badge
counts (`waitingCount`).
*/
export const reviewDecisions = (review: ReviewViewModel): readonly ReviewRow[] =>
  review.items.filter((row) => row.kind !== "unsorted-too-long");

/**
What waits on the person in the Inbox, the figure on its badge (sidebar and phone tab): the
captures plus the decisions, each counted once. Zero hides the badge.
*/
export const waitingCount = (inbox: { readonly count: number }, review: ReviewViewModel): number =>
  inbox.count + reviewDecisions(review).length;
