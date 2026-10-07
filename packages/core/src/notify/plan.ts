import type { CoreState } from "../materialize/core-state.ts";

import { accountTz, type QueryContext } from "../queries/context.ts";
import { nowList } from "../queries/now-list.ts";
import { addMinutesIso } from "../time.ts";
import { type NotifyMemory } from "./evaluate.ts";
import { deadlineCrossingAt } from "./rules.ts";
import { isQuietAt, nextDigestAt } from "./schedule.ts";

/** How far ahead the phone schedules its local reminders. */
export const PLAN_HORIZON_MINUTES = 24 * 60;

export type PlannedNotification =
  | { readonly kind: "deadline"; readonly at: string; readonly taskId: string; readonly title: string }
  | { readonly kind: "digest"; readonly at: string };

const windowsUntil = (
  from: string,
  until: string,
  next: (after: string) => null | string,
): readonly string[] => {
  const found: string[] = [];
  let cursor = next(from);
  while (cursor !== null && cursor <= until) {
    found.push(cursor);
    cursor = next(cursor);
  }
  return found;
};

/**
What the phone schedules as local notifications for the next day, mirroring the server:
the digest windows and the instants open tasks enter their critical window. Nothing
during the quiet hours, nothing for a task already alerted or snoozed.
*/
export const notifyPlan = (
  state: CoreState,
  ctx: QueryContext,
  memory: NotifyMemory,
): readonly PlannedNotification[] => {
  const zone = accountTz(state, ctx);
  const until = addMinutesIso(ctx.now, PLAN_HORIZON_MINUTES);
  const isAwake = (at: string): boolean => !isQuietAt(at, zone, state.settings);
  const digests = windowsUntil(ctx.now, until, (after) => nextDigestAt(after, zone, state.settings))
    .filter(isAwake)
    .map((at) => ({ kind: "digest" as const, at }));
  const deadlines = nowList(state, ctx).items.flatMap((item) => {
    const at = deadlineCrossingAt(item.task, item.preset);
    const isAlerted =
      memory.critical.includes(item.task.id) || (memory.snoozed[item.task.id] ?? "") > ctx.now;
    return at === null || at <= ctx.now || at > until || isAlerted || !isAwake(at)
      ? []
      : [{ kind: "deadline" as const, at, taskId: item.task.id, title: item.task.title }];
  });
  return [...digests, ...deadlines].toSorted((a, b) => a.at.localeCompare(b.at));
};
