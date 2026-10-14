import type { CoreState } from "../materialize/core-state.ts";
import type { ActivityCategory } from "../tracking/model.ts";

import { isOpen } from "../model/task.ts";
import { accountTz, type QueryContext } from "../queries/context.ts";
import { addDaysIn, startOfDayIn } from "../time.ts";

/** An open task as the model sees it: a short alias and its title, never its id. */
export type ContextTask = { readonly alias: string; readonly id: string; readonly title: string };

/** An activity of today or yesterday as the model sees it. */
export type ContextActivity = {
  readonly alias: string;
  readonly id: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly startAt: string;
  /** `null` while it runs. */
  readonly endAt: null | string;
};

/** What the model is shown to refer to: the aliases it may answer with, mapped back in code. */
export type ProposalContext = {
  readonly tasks: readonly ContextTask[];
  readonly activities: readonly ContextActivity[];
};

/** The prompt names at most this many open tasks, the latest touched first. */
export const MAX_CONTEXT_TASKS = 40;
/** And at most this many activities, the latest ones of today and yesterday. */
export const MAX_CONTEXT_ACTIVITIES = 40;
/** A title is cut to this many characters in the list (and quoted from it). */
export const CONTEXT_TITLE_CHARS = 60;

/**
The open tasks (`t1`…) and today's and yesterday's activities (`a1`…) the model may refer to.
Index-based aliases keep ids out of the prompt; the same context maps its answer back.
*/
export const proposalContext = (state: CoreState, ctx: QueryContext): ProposalContext => {
  const zone = accountTz(state, ctx);
  const since = startOfDayIn(addDaysIn(ctx.now, -1, zone), zone);
  const tasks = Object.values(state.tasks.byId)
    .filter(isOpen)
    .toSorted((a, b) => b.lastEventAt.localeCompare(a.lastEventAt))
    .slice(0, MAX_CONTEXT_TASKS)
    .map((task, index) => ({
      alias: `t${String(index + 1)}`,
      id: task.id,
      title: task.title.slice(0, CONTEXT_TITLE_CHARS),
    }));
  const activities = Object.values(state.time.activities)
    .filter((activity) => (activity.endAt ?? ctx.now) >= since && activity.startAt <= ctx.now)
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(-MAX_CONTEXT_ACTIVITIES)
    .map((activity, index) => ({
      alias: `a${String(index + 1)}`,
      category: activity.category,
      endAt: activity.endAt,
      id: activity.id,
      label: activity.label.slice(0, CONTEXT_TITLE_CHARS),
      startAt: activity.startAt,
    }));
  return { activities, tasks };
};
