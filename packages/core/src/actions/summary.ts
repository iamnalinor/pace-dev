import type { Language } from "../i18n/language.ts";
import type { CoreState } from "../materialize/core-state.ts";
import type { ParseField } from "../parse/schema.ts";
import type { Action, ActionBody, TaskPatch } from "./schema.ts";

import { t } from "../i18n/i18n.ts";
import { formatInZone, startOfDayIn } from "../time.ts";
import { ACTION_LIMITS, fitText } from "./limits.ts";

type World = {
  readonly state: CoreState;
  readonly language: Language;
  readonly zone: string;
  readonly now: string;
};

/** `HH:mm` today, `dd.MM HH:mm` on another day. */
const clockOf = (at: string, { now, zone }: World): string =>
  formatInZone(
    at,
    zone,
    startOfDayIn(at, zone) === startOfDayIn(now, zone) ? "HH:mm" : "dd.MM HH:mm",
  );

/** A block's start and end, `…` for an end still to come or a block no longer there. */
const spanOf = (
  activity: undefined | { readonly startAt: string; readonly endAt: null | string },
  world: World,
) => ({
  end: (activity?.endAt ?? null) === null ? "…" : clockOf(activity?.endAt ?? "", world),
  start: activity === undefined ? "…" : clockOf(activity.startAt, world),
});

const PATCH_FIELDS: readonly (readonly [keyof TaskPatch, ParseField])[] = [
  ["title", "title"],
  ["description", "description"],
  ["due", "dueDate"],
  ["importance", "importance"],
  ["projectId", "project"],
  ["projectName", "project"],
  ["presetId", "category"],
  ["estimateMinutes", "estimateMinutes"],
  ["link", "link"],
  ["subtasks", "subtasks"],
];

/** The names of the fields a patch changes, each once, in the person's language. */
const fieldsOf = (keys: readonly ParseField[], language: Language): string =>
  [...new Set(keys)].map((field) => t(language, `parseField.${field}`)).join(", ");

const taskTitle = (state: CoreState, taskId: string): string =>
  state.tasks.byId[taskId]?.title ?? taskId;

/** At most this many items of a list are named; the rest are counted ("+3"). */
const LISTED = 5;

const listOf = (items: readonly string[]): string =>
  [
    ...items.slice(0, LISTED),
    ...(items.length > LISTED ? [`+${String(items.length - LISTED)}`] : []),
  ].join(", ");

const subtaskLabels = (state: CoreState, taskId: string, ids: readonly string[]): string =>
  listOf(
    ids.map(
      (id) => state.tasks.byId[taskId]?.subtasks.find((subtask) => subtask.id === id)?.label ?? id,
    ),
  );

const taskSummary = (
  body: Extract<ActionBody, { kind: `task.${string}` }>,
  world: World,
): string => {
  const { language, state } = world;
  switch (body.kind) {
    case "task.create": {
      return t(language, "action.task.create", { title: body.task.title });
    }
    case "task.update": {
      const keys = PATCH_FIELDS.filter(([key]) => body.patch[key] !== undefined).map(
        ([, field]) => field,
      );
      return t(language, "action.task.update", {
        fields: fieldsOf(keys, language),
        title: taskTitle(state, body.taskId),
      });
    }
    case "task.delete": {
      return t(language, "action.task.delete", { title: taskTitle(state, body.taskId) });
    }
    case "task.close": {
      return t(language, "action.task.close", {
        outcome: t(language, `outcome.${body.outcome}`),
        title: taskTitle(state, body.taskId),
      });
    }
    case "task.addSubtasks": {
      return t(language, "action.task.addSubtasks", {
        subtasks: listOf(body.subtasks.map((subtask) => subtask.label)),
        title: taskTitle(state, body.taskId),
      });
    }
    case "task.markSubtasks": {
      return t(language, "action.task.markSubtasks", {
        subtasks: subtaskLabels(state, body.taskId, body.subtaskIds),
        title: taskTitle(state, body.taskId),
      });
    }
  }
};

const ACTIVITY_FIELDS: readonly (readonly [
  keyof Extract<ActionBody, { kind: "activity.update" }>["patch"],
  ParseField,
])[] = [
  ["start", "start"],
  ["end", "end"],
  ["label", "label"],
  ["category", "category"],
];

const startSummary = (body: Extract<ActionBody, { kind: "activity.start" }>, world: World) =>
  body.startAt === undefined
    ? t(world.language, "action.activity.start", { label: body.label })
    : t(world.language, "action.activity.startSince", {
        label: body.label,
        start: clockOf(body.startAt, world),
      });

const activitySummary = (
  body: Extract<ActionBody, { kind: `activity.${string}` }>,
  world: World,
): string => {
  const { language, state } = world;
  switch (body.kind) {
    case "activity.start": {
      return startSummary(body, world);
    }
    case "activity.log": {
      return t(language, "action.activity.log", {
        end: clockOf(body.end, world),
        label: body.label,
        start: clockOf(body.start, world),
      });
    }
    case "activity.update": {
      const keys = ACTIVITY_FIELDS.filter(([key]) => body.patch[key] !== undefined).map(
        ([, field]) => field,
      );
      return t(language, "action.activity.update", {
        fields: fieldsOf(keys, language),
        label: state.time.activities[body.activityId]?.label ?? body.activityId,
      });
    }
    case "activity.delete": {
      const activity = state.time.activities[body.activityId];
      return t(language, "action.activity.delete", {
        ...spanOf(activity, world),
        label: activity?.label ?? body.activityId,
      });
    }
  }
};

const sentenceOf = (body: ActionBody, world: World): string =>
  body.kind.startsWith("task.")
    ? taskSummary(body as Extract<ActionBody, { kind: `task.${string}` }>, world)
    : activitySummary(body as Extract<ActionBody, { kind: `activity.${string}` }>, world);

/** One line saying what a action does, written by code in the person's language. */
export const summarize = (body: ActionBody, world: World): string =>
  fitText(sentenceOf(body, world), ACTION_LIMITS.summary);

/** A action as the API answers it: its body, its summary and the fields to double-check. */
export const withSummary = (
  body: ActionBody,
  doubtful: readonly ParseField[],
  world: World,
): Action => ({
  ...body,
  ...(doubtful.length > 0 && { doubtful: [...doubtful] }),
  summary: summarize(body, world),
});
