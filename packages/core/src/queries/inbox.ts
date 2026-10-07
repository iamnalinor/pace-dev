import type { CoreState } from "../materialize/core-state.ts";
import type { QueryContext } from "./context.ts";

import { isOpen, type Task } from "../model/task.ts";
import { minutesBetween } from "../time.ts";
import { isInboxTask } from "./classify.ts";
import { suggestFor, type Suggestion } from "./suggest.ts";

/** An item unsorted for longer than this surfaces in the review block. */
export const UNSORTED_TOO_LONG_MINUTES = 3 * 24 * 60;

export type InboxItem = {
  readonly task: Task;
  readonly ageMinutes: number;
  readonly unsortedTooLong: boolean;
  readonly suggestion: Suggestion;
};

/** Oldest first: the inbox is a queue, and what was captured first is sorted first. */
const byAge = (a: Task, b: Task): number => {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : 1;
};

/** The captured text is what the suggestion is read from; the title mirrors it when there is none. */
const textOf = (task: Task): string => task.sourceText ?? task.title;

export const inboxList = (state: CoreState, ctx: QueryContext): readonly InboxItem[] =>
  Object.values(state.tasks.byId)
    .filter((task) => isOpen(task) && isInboxTask(task))
    .toSorted(byAge)
    .map((task) => {
      const ageMinutes = minutesBetween(task.createdAt, ctx.now);
      return {
        task,
        ageMinutes,
        unsortedTooLong: ageMinutes > UNSORTED_TOO_LONG_MINUTES,
        suggestion: suggestFor(state, textOf(task), ctx),
      };
    });
