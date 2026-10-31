import type { Language } from "../i18n/language.ts";
import type { CoreState } from "../materialize/core-state.ts";
import type { ParseField } from "../parse/schema.ts";
import type { Action } from "./schema.ts";

import { formatDuration, type MessageKey, t } from "../i18n/i18n.ts";
import { projectById } from "../model/project.ts";
import { presetLabel } from "../presets/preset-label.ts";
import { presetById } from "../presets/preset-reducer.ts";
import { formatInZone, startOfDayIn } from "../time.ts";
import { fitText } from "./limits.ts";

/** What an edit makes of each field it changes, as `details.ts` lists them before Approve. */

type EditDraft = {
  readonly field: null | ParseField;
  readonly key: MessageKey;
  readonly value: null | string;
};

type World = {
  readonly state: CoreState;
  readonly language: Language;
  readonly now?: string;
};

/** A long text (a description, a link) is shown cut: the card names it, it does not hold it. */
const SHORT_TEXT = 80;

/** "Wed, Oct 7, 15:00": a deadline on the card, in its own zone. */
export const dueTextOf = (at: string, tz: string, language: Language): string =>
  new Intl.DateTimeFormat(language, {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone: tz,
    weekday: "short",
  }).format(new Date(at));

/** `HH:mm` today on the account's clock, `dd.MM HH:mm` on another day (or with no instant). */
const clockOf = (at: string, { now, state }: World): string => {
  const zone = state.settings.timezone ?? "UTC";
  const isToday = now !== undefined && startOfDayIn(at, zone) === startOfDayIn(now, zone);
  return formatInZone(at, zone, isToday ? "HH:mm" : "dd.MM HH:mm");
};

/** A value an edit sets, or "none" for one it clears; `null` for a field it leaves alone. */
const setOrNone = <T>(
  value: null | T | undefined,
  show: (value: T) => string,
  language: Language,
): null | string => {
  if (value === undefined) {
    return null;
  }
  return value === null ? t(language, "action.value.none") : show(value);
};

const projectText = (
  patch: Extract<Action, { kind: "task.update" }>["patch"],
  { language, state }: World,
): null | string =>
  patch.projectName ??
  setOrNone(patch.projectId, (id) => projectById(state.projects, id)?.name ?? id, language);

/** A task edit: its new title, deadline, estimate, importance, category, project, link, text. */
export const taskEditDrafts = (
  action: Extract<Action, { kind: "task.update" }>,
  world: World,
): readonly EditDraft[] => {
  const { patch } = action;
  const { language, state } = world;
  const preset =
    patch.presetId === undefined ? undefined : presetById(state.presets, patch.presetId);
  return [
    { field: "title", key: "action.field.newTitle", value: patch.title ?? null },
    {
      field: "dueDate",
      key: "action.field.due",
      value: setOrNone(patch.due, (due) => dueTextOf(due.at, due.tz, language), language),
    },
    {
      field: "estimateMinutes",
      key: "action.field.estimate",
      value: setOrNone(
        patch.estimateMinutes,
        (minutes) => formatDuration(minutes, language),
        language,
      ),
    },
    {
      field: "importance",
      key: "action.field.importance",
      value: patch.importance === undefined ? null : t(language, `importance.${patch.importance}`),
    },
    {
      field: "category",
      key: "action.field.category",
      value: preset === undefined ? (patch.presetId ?? null) : presetLabel(preset, language),
    },
    { field: "project", key: "action.field.project", value: projectText(patch, world) },
    {
      field: "link",
      key: "action.field.link",
      value: setOrNone(patch.link, (link) => fitText(link, SHORT_TEXT), language),
    },
    {
      field: "description",
      key: "action.field.description",
      value: setOrNone(patch.description, (text) => fitText(text, SHORT_TEXT), language),
    },
  ];
};

/** An activity edit: its new start, end, name and category. */
export const activityEditDrafts = (
  action: Extract<Action, { kind: "activity.update" }>,
  world: World,
): readonly EditDraft[] => {
  const { patch } = action;
  return [
    {
      field: "start",
      key: "action.field.start",
      value: patch.start === undefined ? null : clockOf(patch.start, world),
    },
    {
      field: "end",
      key: "action.field.end",
      value: patch.end === undefined ? null : clockOf(patch.end, world),
    },
    { field: "label", key: "action.field.name", value: patch.label ?? null },
    {
      field: "category",
      key: "action.field.category",
      value: patch.category === undefined ? null : t(world.language, `category.${patch.category}`),
    },
  ];
};
