import {
  type CoreState,
  type Importance,
  inboxList,
  presetById,
  projectById,
  type ProjectColorName,
  type QueryContext,
  type Suggestion,
} from "@pace/core";

import { type DueRelative, relativeDay } from "./relative-day.ts";

/** The guessed fields of a card, each one tappable to change. */
export type InboxChip =
  | {
      readonly kind: "due";
      readonly at: string;
      readonly tz: string;
      readonly relative: DueRelative;
    }
  | { readonly kind: "importance"; readonly importance: Importance }
  | { readonly kind: "no-deadline" }
  | { readonly kind: "preset"; readonly id: string; readonly name: string }
  | {
      readonly kind: "project";
      readonly id: string;
      readonly name: string;
      readonly color: null | ProjectColorName;
    };

export type InboxCard = {
  readonly id: string;
  /** The captured text, exactly as typed. */
  readonly text: string;
  readonly ageMinutes: number;
  readonly tooLong: boolean;
  readonly suggestion: Suggestion;
  readonly chips: readonly InboxChip[];
};

export type InboxViewModel = {
  readonly count: number;
  readonly cards: readonly InboxCard[];
};

const projectChip = (state: CoreState, projectId: null | string): readonly InboxChip[] => {
  const project = projectId === null ? undefined : projectById(state.projects, projectId);
  return project === undefined
    ? []
    : [{ kind: "project", id: project.id, name: project.name, color: project.color }];
};

const dueChip = (suggestion: Suggestion, ctx: QueryContext): InboxChip =>
  suggestion.dueAt === null || suggestion.dueTz === null
    ? { kind: "no-deadline" }
    : {
        kind: "due",
        at: suggestion.dueAt,
        tz: suggestion.dueTz,
        relative: relativeDay(suggestion.dueAt, ctx),
      };

const chips = (
  state: CoreState,
  suggestion: Suggestion,
  ctx: QueryContext,
): readonly InboxChip[] => [
  ...projectChip(state, suggestion.projectId),
  {
    kind: "preset",
    id: suggestion.presetId,
    name: presetById(state.presets, suggestion.presetId)?.name ?? suggestion.presetId,
  },
  dueChip(suggestion, ctx),
  { kind: "importance", importance: suggestion.importance },
];

export const inboxViewModel = (state: CoreState, ctx: QueryContext): InboxViewModel => {
  const items = inboxList(state, ctx);
  return {
    count: items.length,
    cards: items.map((item) => ({
      id: item.task.id,
      text: item.task.sourceText ?? item.task.title,
      ageMinutes: item.ageMinutes,
      tooLong: item.unsortedTooLong,
      suggestion: item.suggestion,
      chips: chips(state, item.suggestion, ctx),
    })),
  };
};
