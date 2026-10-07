import type { CoreState } from "../materialize/core-state.ts";
import type { NotifyMemory } from "./evaluate.ts";

import { accountTz, type QueryContext } from "../queries/context.ts";
import { nowList } from "../queries/now-list.ts";
import { addMinutesIso } from "../time.ts";
import { deadlineCrossingAt } from "./rules.ts";
import { isQuietAt, nextDigestAt } from "./schedule.ts";

/** How far ahead the phone schedules its local reminders. */
export const PLAN_HORIZON_MINUTES = 24 * 60;

export type PlannedNotification =
  | {
      readonly kind: "deadline";
      readonly at: string;
      readonly taskId: string;
      readonly title: string;
    }
  | { readonly kind: "digest"; readonly at: string };

/** The instants `next` yields after `from`, up to `until`. */
const windowsUntil = (
  from: string,
  until: string,
  next: (after: string) => null | string,
): readonly string[] => {
  const cursor = next(from);
  return cursor === null || cursor > until ? [] : [cursor, ...windowsUntil(cursor, until, next)];
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
    .filter((at) => isAwake(at))
    .map((at) => ({ kind: "digest" as const, at }));
  const isAlerted = (taskId: string): boolean =>
    memory.critical.includes(taskId) || (memory.snoozed[taskId] ?? "") > ctx.now;
  const deadlines = nowList(state, ctx)
    .items.filter((item) => !isAlerted(item.task.id))
    .map((item) => ({ at: deadlineCrossingAt(item.task, item.preset), task: item.task }))
    .filter(
      (entry): entry is typeof entry & { at: string } =>
        entry.at !== null && entry.at > ctx.now && entry.at <= until && isAwake(entry.at),
    )
    .map((entry) => ({
      kind: "deadline" as const,
      at: entry.at,
      taskId: entry.task.id,
      title: entry.task.title,
    }));
  return [...digests, ...deadlines].toSorted((a, b) => a.at.localeCompare(b.at));
};
