import type { Language } from "../i18n/language.ts";
import type { CoreState } from "../materialize/core-state.ts";
import type { ParseField } from "../parse/schema.ts";
import type { ActivityCategory } from "../tracking/model.ts";
import type { Action, TaskDraft } from "./schema.ts";

import { formatDuration, type MessageKey, t } from "../i18n/i18n.ts";
import { projectById } from "../model/project.ts";
import { presetLabel } from "../presets/preset-label.ts";
import { presetById } from "../presets/preset-reducer.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";

/** One field of an action as a reviewer reads it; `isDoubtful` when the model only guessed it. */
export type DetailLine = {
  readonly field: null | ParseField;
  readonly label: string;
  readonly value: string;
  readonly isDoubtful: boolean;
};

type World = { readonly state: CoreState; readonly language: Language };

type Draft = {
  readonly field: null | ParseField;
  readonly key: MessageKey;
  readonly value: null | string;
};

const dueText = (task: TaskDraft, language: Language): null | string =>
  task.dueAt === null || task.dueTz === null
    ? null
    : new Intl.DateTimeFormat(language, {
        day: "numeric",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "short",
        timeZone: task.dueTz,
        weekday: "short",
      }).format(new Date(task.dueAt));

/** The importance the task gets: its own, else its category's default. */
const importanceOf = (task: TaskDraft, state: CoreState) => {
  const resolved = resolvePreset(state.presets, task.presetId);
  return task.importance ?? (resolved.ok ? resolved.value.defaultImportance : null);
};

const createDrafts = (task: TaskDraft, { language, state }: World): readonly Draft[] => {
  const preset = presetById(state.presets, task.presetId);
  const project = task.projectId === null ? undefined : projectById(state.projects, task.projectId);
  const importance = importanceOf(task, state);
  return [
    { field: "title", key: "action.field.title", value: task.title },
    {
      field: "category",
      key: "action.field.category",
      value: preset === undefined ? task.presetId : presetLabel(preset, language),
    },
    { field: "project", key: "action.field.project", value: project?.name ?? task.projectName },
    { field: "dueDate", key: "action.field.due", value: dueText(task, language) },
    {
      field: "estimateMinutes",
      key: "action.field.estimate",
      value: task.estimateMinutes === null ? null : formatDuration(task.estimateMinutes, language),
    },
    {
      field: null,
      key: "action.field.importance",
      value: importance === null ? null : t(language, `importance.${importance}`),
    },
    {
      field: "subtasks",
      key: "action.field.subtasks",
      value: task.subtasks.length === 0 ? null : task.subtasks.map((item) => item.label).join(", "),
    },
  ];
};

const categoryDraft = (category: ActivityCategory, language: Language): Draft => ({
  field: "category",
  key: "action.field.category",
  value: t(language, `category.${category}`),
});

const startDrafts = (
  action: Extract<Action, { kind: "activity.start" }>,
  { language }: World,
): readonly Draft[] => [
  categoryDraft(action.category, language),
  {
    field: "expectMinutes",
    key: "action.field.expect",
    value:
      action.expectMinutes === null || action.expectMinutes === undefined
        ? null
        : `~${formatDuration(action.expectMinutes, language)}`,
  },
];

/** Edits, closes and deletes say all there is in their summary: they list nothing. */
const draftsOf = (action: Action, world: World): readonly Draft[] => {
  if (action.kind === "task.create") {
    return createDrafts(action.task, world);
  }
  if (action.kind === "activity.start") {
    return startDrafts(action, world);
  }
  return action.kind === "activity.log" ? [categoryDraft(action.category, world.language)] : [];
};

/**
What an action sets, field by field, for review before Approve: a new task's category, due,
estimate and importance, an activity's category and expected length. Doubtful fields are
marked.
*/
export const actionDetails = (action: Action, world: World): readonly DetailLine[] => {
  const doubtful = action.doubtful ?? [];
  return draftsOf(action, world)
    .filter((draft): draft is Draft & { readonly value: string } => draft.value !== null)
    .map(({ field, key, value }) => ({
      field,
      isDoubtful: field !== null && doubtful.includes(field),
      label: t(world.language, key),
      value,
    }));
};

/**
The lines shown under an action's summary: what it sets, without the title the summary
already names, unless the model only guessed that title.
*/
export const summaryDetails = (action: Action, world: World): readonly DetailLine[] =>
  actionDetails(action, world).filter((line) => line.field !== "title" || line.isDoubtful);

/** "Due: Wed, Oct 7, 15:00 (check this)": one line as the card and the bot show it. */
export const detailText = (line: DetailLine, language: Language): string => {
  const text = `${line.label}: ${line.value}`;
  return line.isDoubtful ? [text, t(language, "action.doubtful")].join(" ") : text;
};
