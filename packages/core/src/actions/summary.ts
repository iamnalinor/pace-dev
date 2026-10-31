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

const ACTIVITY_FIELDS: readonly (readonly [
  keyof Extract<ActionBody, { kind: "activity.update" }>["patch"],
  ParseField,
])[] = [
  ["start", "start"],
  ["end", "end"],
  ["label", "label"],
  ["category", "category"],
];

/** The fields an edit changes, in the order a summary names them (repeats possible). */
export const changedFields = (
  body: Extract<ActionBody, { kind: "activity.update" | "task.update" }>,
): readonly ParseField[] =>
  body.kind === "task.update"
    ? PATCH_FIELDS.filter(([key]) => body.patch[key] !== undefined).map(([, field]) => field)
    : ACTIVITY_FIELDS.filter(([key]) => body.patch[key] !== undefined).map(([, field]) => field);

/**
The new name of an edit that changes nothing but the name (a task's title, an activity's
label): its summary says "rename … to …" and needs no detail line; `null` for any other edit.
*/
export const renameOf = (body: ActionBody): null | string => {
  if (body.kind !== "task.update" && body.kind !== "activity.update") {
    return null;
  }
  const fields = new Set(changedFields(body));
  if (fields.size !== 1) {
    return null;
  }
  return body.kind === "task.update" ? (body.patch.title ?? null) : (body.patch.label ?? null);
};

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
      const renamed = renameOf(body);
      if (renamed !== null) {
        return t(language, "action.task.rename", {
          newTitle: renamed,
          title: taskTitle(state, body.taskId),
        });
      }
      return t(language, "action.task.update", {
        fields: fieldsOf(changedFields(body), language),
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

const startSummary = (body: Extract<ActionBody, { kind: "activity.start" }>, world: World) =>
  body.startAt === undefined
    ? t(world.language, "action.activity.start", { label: body.label })
    : t(world.language, "action.activity.startSince", {
        label: body.label,
        start: clockOf(body.startAt, world),
      });

/** A block by its span; one still running by its start ("running since 22:27"). */
const deleteSummary = (body: Extract<ActionBody, { kind: "activity.delete" }>, world: World) => {
  const activity = world.state.time.activities[body.activityId];
  const label = activity?.label ?? body.activityId;
  return activity?.endAt === null && !activity.isLogged
    ? t(world.language, "action.activity.deleteRunning", {
        label,
        start: clockOf(activity.startAt, world),
      })
    : t(world.language, "action.activity.delete", { ...spanOf(activity, world), label });
};

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
      const label = state.time.activities[body.activityId]?.label ?? body.activityId;
      const renamed = renameOf(body);
      return renamed === null
        ? t(language, "action.activity.update", {
            fields: fieldsOf(changedFields(body), language),
            label,
          })
        : t(language, "action.activity.rename", { label, newLabel: renamed });
    }
    case "activity.delete": {
      return deleteSummary(body, world);
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
