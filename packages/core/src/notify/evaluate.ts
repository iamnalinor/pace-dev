import type { CoreState } from "../materialize/core-state.ts";
import type { Importance } from "../model/preset.ts";

import { isOpen, taskById } from "../model/task.ts";
import { accountTz, type QueryContext } from "../queries/context.ts";
import { hasLaterStart, type NowItem, nowItem } from "../queries/now-item.ts";
import { nowList } from "../queries/now-list.ts";
import { reviewItems } from "../review/to-sort.ts";
import { minutesBetween } from "../time.ts";
import { type LongRun, longRunCrossing, longRunOf } from "./long-run.ts";
import { type Critical, criticalOf, deadlineCrossingAt, type Stuck, stuckOf } from "./rules.ts";
import { isQuietAt, lastDigestWindow, nextDigestAt } from "./schedule.ts";

/** A digest more than this late (the alarm was missed) is skipped rather than sent stale. */
export const DIGEST_GRACE_MINUTES = 90;
/** How many Now rows a digest lists. */
export const DIGEST_TOP = 3;

/**
What the notifier remembers between evaluations, kept by the server next to the log. Not
events: nothing here is a user action, and the decision log records every outcome.
*/
export type NotifyMemory = {
  /** The last evaluation outside the quiet hours: crossings before it are retro. */
  readonly evaluatedAt: null | string;
  /** The last digest window handled (sent or skipped). */
  readonly digestWindow: null | string;
  /** Tasks already alerted (or suppressed) as critical: one alert per task. */
  readonly critical: readonly string[];
  /** Stuck spells already reported, as `taskId@since`. */
  readonly stuck: readonly string[];
  /** Task id → until when its alerts are snoozed. */
  readonly snoozed: Readonly<Record<string, string>>;
  /** Activities already asked "still doing this?" (absent in older memories). */
  readonly longRuns?: readonly string[];
};

export const INITIAL_NOTIFY_MEMORY: NotifyMemory = {
  evaluatedAt: null,
  digestWindow: null,
  critical: [],
  stuck: [],
  snoozed: {},
};

export type DigestRow = {
  readonly taskId: string;
  readonly title: string;
  readonly importance: Importance;
  readonly dueAt: null | string;
  readonly dueTz: null | string;
  readonly isLate: boolean;
};

export type Digest = {
  readonly window: string;
  readonly top: readonly DigestRow[];
  /** Open tasks on Now beyond the top rows. */
  readonly more: number;
  readonly reviewCount: number;
  readonly inboxCount: number;
};

export type NotifyMessage =
  | (Critical & { readonly kind: "critical" })
  | (Digest & { readonly kind: "digest" })
  | (LongRun & { readonly kind: "long" })
  | (Stuck & { readonly kind: "stuck" });

export type NotifyOutcome = "sent" | "suppressed";

/** One entry of the decision log: what was decided, by which rule, from which inputs. */
export type NotifyDecision = {
  readonly kind: "notification";
  readonly taskId: null | string;
  readonly rule: string;
  readonly outcome: NotifyOutcome;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly explanation: string;
};

export type NotifyEvaluation = {
  readonly messages: readonly NotifyMessage[];
  readonly decisions: readonly NotifyDecision[];
  readonly memory: NotifyMemory;
  /** When to evaluate again; `null` when nothing is scheduled. */
  readonly nextAt: null | string;
};

/** The running activity at twice its Expect: asked once per activity, logged like any other. */
const longRunStep = (
  state: CoreState,
  ctx: QueryContext,
  memory: NotifyMemory,
): Step & { readonly handled: readonly string[] } => {
  const alert = longRunOf(state.time, ctx.now, memory.longRuns ?? []);
  if (alert === null) {
    return { decisions: [], handled: [], messages: [] };
  }
  const message: NotifyMessage = { kind: "long", ...alert };
  return {
    decisions: [decision(message, "sent", "The running activity took twice its Expect.")],
    handled: [alert.activityId],
    messages: [message],
  };
};

const decision = (
  message: NotifyMessage,
  outcome: NotifyOutcome,
  explanation: string,
): NotifyDecision => {
  const { kind, ...inputs } = message;
  return {
    kind: "notification",
    taskId: "taskId" in message ? message.taskId : null,
    rule: kind,
    outcome,
    inputs,
    explanation,
  };
};

const digestRow = (item: NowItem): DigestRow => ({
  taskId: item.task.id,
  title: item.task.title,
  importance: item.importance,
  dueAt: item.dueAt,
  dueTz: item.dueTz,
  isLate: item.isLate,
});

/** One evaluation's inputs: the state, the instant and zone, and what was sent before. */
type Pass = {
  readonly state: CoreState;
  readonly ctx: QueryContext;
  readonly memory: NotifyMemory;
};

/** Whether the task already met a critical rule at `at`, judged on what is known now. */
const wasCriticalAt = ({ ctx, state }: Pass, taskId: string, at: string): boolean => {
  const task = taskById(state.tasks, taskId);
  if (task === undefined || task.createdAt > at) {
    return false;
  }
  const item = nowItem(state, task, { ...ctx, now: at });
  return item.ok && !hasLaterStart(task, at) && criticalOf(item.value, at) !== null;
};

const isSnoozed = (memory: NotifyMemory, taskId: string, now: string): boolean =>
  (memory.snoozed[taskId] ?? "") > now;

type Step = { readonly messages: NotifyMessage[]; readonly decisions: NotifyDecision[] };

const criticalStep = (
  pass: Pass,
  items: readonly NowItem[],
): Step & { readonly handled: readonly string[] } => {
  const { ctx, memory } = pass;
  const found = items
    .filter(
      (item) =>
        !memory.critical.includes(item.task.id) && !isSnoozed(memory, item.task.id, ctx.now),
    )
    .map((item) => criticalOf(item, ctx.now))
    .filter((critical) => critical !== null)
    .map((critical) => ({ kind: "critical" as const, ...critical }));
  const isRetro = (message: NotifyMessage & { kind: "critical" }): boolean =>
    memory.evaluatedAt === null || wasCriticalAt(pass, message.taskId, memory.evaluatedAt);
  return {
    messages: found.filter((message) => !isRetro(message)),
    decisions: found.map((message) =>
      isRetro(message)
        ? decision(
            message,
            "suppressed",
            "Already critical before the last check: a retro edit, not news.",
          )
        : decision(message, "sent", "Crossed a critical threshold since the last check."),
    ),
    handled: found.map((message) => message.taskId),
  };
};

const digestOf = (state: CoreState, ctx: QueryContext, window: string): Digest => {
  const list = nowList(state, ctx);
  return {
    window,
    top: list.items.slice(0, DIGEST_TOP).map((item) => digestRow(item)),
    more: Math.max(0, list.items.length - DIGEST_TOP),
    reviewCount: reviewItems(state, ctx).length,
    inboxCount: list.inboxCount,
  };
};

const digestStep = (state: CoreState, ctx: QueryContext, window: string): Step => {
  const digest: NotifyMessage = { kind: "digest", ...digestOf(state, ctx, window) };
  if (minutesBetween(window, ctx.now) > DIGEST_GRACE_MINUTES) {
    return {
      messages: [],
      decisions: [decision(digest, "suppressed", "The window passed while the server was asleep.")],
    };
  }
  const isEmpty = digest.top.length === 0 && digest.reviewCount === 0 && digest.inboxCount === 0;
  return isEmpty
    ? { messages: [], decisions: [decision(digest, "suppressed", "Nothing to report.")] }
    : { messages: [digest], decisions: [decision(digest, "sent", "A digest window.")] };
};

const stuckKey = (stuck: Stuck): string => `${stuck.taskId}@${stuck.since}`;

const stuckStep = (
  ctx: QueryContext,
  memory: NotifyMemory,
  items: readonly NowItem[],
): Step & { readonly handled: readonly string[] } => {
  const found = items
    .map((item) => stuckOf(item.task, item.preset, ctx.now))
    .filter(
      (stuck): stuck is Stuck =>
        stuck !== null &&
        !memory.stuck.includes(stuckKey(stuck)) &&
        !isSnoozed(memory, stuck.taskId, ctx.now),
    )
    .map((stuck) => ({ kind: "stuck" as const, ...stuck }));
  return {
    messages: found,
    decisions: found.map((message) => decision(message, "sent", "Stuck past the preset's limit.")),
    handled: found.map((message) => stuckKey(message)),
  };
};

/** Open task ids only, so the memory does not grow with the history. */
const keepOpen = (state: CoreState, ids: readonly string[]): readonly string[] =>
  ids.filter((id) => {
    const task = taskById(state.tasks, id.split("@", 1)[0] ?? id);
    return task !== undefined && isOpen(task);
  });

const laterOf = (candidates: readonly (null | string)[], now: string): null | string =>
  candidates
    .filter((at): at is string => at !== null && at > now)
    .toSorted((a, b) => a.localeCompare(b))
    .at(0) ?? null;

/**
The next instant worth evaluating: the next digest window, the next deadline crossing of
a task not yet alerted, or the end of a snooze. An evaluation that lands in the quiet
hours sends nothing and re-arms, so a crossing at night is reported in the morning.
*/
export const nextAlarmAt = (
  state: CoreState,
  ctx: QueryContext,
  memory: NotifyMemory,
): null | string => {
  const zone = accountTz(state, ctx);
  const items = nowList(state, ctx).items;
  const crossings = items
    .filter((item) => !memory.critical.includes(item.task.id))
    .map((item) => deadlineCrossingAt(item.task, item.preset));
  const long = longRunCrossing(state.time, ctx.now);
  const longAt =
    long === null || (memory.longRuns ?? []).includes(long.activityId) ? null : long.crossedAt;
  return laterOf(
    [
      nextDigestAt(ctx.now, zone, state.settings),
      ...crossings,
      longAt,
      ...Object.values(memory.snoozed),
    ],
    ctx.now,
  );
};

/**
One pass of the notifier at `ctx.now`. Quiet hours send nothing and keep the memory, so
whatever crossed at night is still news in the morning. Otherwise: critical alerts (one
per task; a crossing that a retro edit placed before the last evaluation, or that predates
the very first one, is logged as suppressed: the digest shows it), "still doing this?" for
the running activity at twice its Expect (once per activity), and in a digest window the
digest plus the stuck reports.
*/
export const evaluateNotifications = (
  state: CoreState,
  ctx: QueryContext,
  memory: NotifyMemory,
): NotifyEvaluation => {
  const zone = accountTz(state, ctx);
  if (isQuietAt(ctx.now, zone, state.settings)) {
    return { messages: [], decisions: [], memory, nextAt: nextAlarmAt(state, ctx, memory) };
  }
  const list = nowList(state, ctx);
  const critical = criticalStep({ ctx, memory, state }, list.items);
  const long = longRunStep(state, ctx, memory);
  const window = lastDigestWindow(ctx.now, zone, state.settings);
  const isDigestDue =
    window !== null && (memory.digestWindow === null || window > memory.digestWindow);
  const digest = isDigestDue ? digestStep(state, ctx, window) : { messages: [], decisions: [] };
  const stuck = isDigestDue
    ? stuckStep(ctx, memory, list.items)
    : { messages: [], decisions: [], handled: [] };
  const next: NotifyMemory = {
    evaluatedAt: ctx.now,
    digestWindow: isDigestDue ? window : memory.digestWindow,
    critical: keepOpen(state, [...memory.critical, ...critical.handled]),
    stuck: keepOpen(state, [...memory.stuck, ...stuck.handled]),
    snoozed: Object.fromEntries(
      Object.entries(memory.snoozed).filter(([, until]) => until > ctx.now),
    ),
    // Only the running activity can still cross: older ids are dropped.
    longRuns: [...(memory.longRuns ?? []), ...long.handled].filter(
      (id) => longRunCrossing(state.time, ctx.now)?.activityId === id,
    ),
  };
  return {
    messages: [...critical.messages, ...long.messages, ...digest.messages, ...stuck.messages],
    decisions: [...critical.decisions, ...long.decisions, ...digest.decisions, ...stuck.decisions],
    memory: next,
    nextAt: nextAlarmAt(state, ctx, next),
  };
};

/** Snoozes a task's alerts until `until` (the next window, tomorrow morning, a picked time). */
export const snooze = (memory: NotifyMemory, taskId: string, until: string): NotifyMemory => ({
  ...memory,
  snoozed: { ...memory.snoozed, [taskId]: until },
});
