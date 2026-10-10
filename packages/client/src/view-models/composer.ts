import {
  byPresetOrder,
  type CoreState,
  type Importance,
  isHttpUrl,
  linkHost,
  openInstanceOf,
  openInstancesOf,
  parseQuickInput,
  presetById,
  projectById,
  type ProjectColorName,
  type QueryContext,
  type QuickSpan,
  type QuickSubtask,
  resolvePreset,
} from "@pace/core";

import type { TaskLink } from "./task.ts";

/**
What the user changed by tapping a chip; each wins over what the text says. `null` clears
a field the text filled (no project, no due, no estimate, no link).
*/
export type ComposerEdits = {
  readonly presetId?: string | undefined;
  readonly projectId?: null | string | undefined;
  readonly importance?: Importance | undefined;
  readonly due?: null | undefined | { readonly at: string; readonly tz: string };
  readonly estimateMinutes?: null | number | undefined;
  readonly link?: null | string | undefined;
  /** A project to create by name (the assistant named one that does not exist yet). */
  readonly projectName?: null | string | undefined;
  /** The assistant's reading of the title and the problems, over the rules' one. */
  readonly title?: string | undefined;
  readonly subtasks?: readonly QuickSubtask[] | undefined;
  /** The details beyond the title (the assistant's reading, or typed in the form). */
  readonly description?: null | string | undefined;
  /** When the task starts; `null` (the default) is "now, as it is created". */
  readonly start?: null | undefined | { readonly at: string; readonly tz: string };
  /** Which week's homework to add to: a task id, or `null` for a task of its own. */
  readonly targetTaskId?: null | string | undefined;
};

export type ComposerOption = {
  readonly id: string;
  readonly name: string;
  readonly color: null | ProjectColorName;
};

/** Where Enter puts the text: a new task, or this week's homework of the chosen course. */
export type ComposerTarget =
  | { readonly kind: "instance"; readonly taskId: string; readonly title: string }
  | { readonly kind: "new" };

export type ComposerModel = {
  /** Exactly what was typed; stored as the task's source. */
  readonly text: string;
  readonly title: string;
  readonly isEmpty: boolean;
  readonly preset: ComposerOption;
  readonly presets: readonly ComposerOption[];
  readonly project: ComposerOption | null;
  /** A `#name` that matches no project yet: created on add. */
  readonly newProjectName: null | string;
  readonly projects: readonly ComposerOption[];
  readonly importance: Importance;
  /** The category's own importance, preselected when the text names none. */
  readonly defaultImportance: Importance;
  readonly due: null | { readonly at: string; readonly tz: string };
  readonly start: null | { readonly at: string; readonly tz: string };
  readonly description: null | string;
  readonly estimateMinutes: null | number;
  readonly link: null | TaskLink;
  readonly subtasks: readonly QuickSubtask[];
  /** Which part of the text produced each chip, for highlighting. */
  readonly spans: readonly QuickSpan[];
  readonly target: ComposerTarget;
  /** The chosen course's open weeks, the earliest due first: what "Add to" can pick. */
  readonly instances: readonly { readonly id: string; readonly title: string }[];
};

const presetOptions = (state: CoreState): readonly ComposerOption[] =>
  Object.values(state.presets.byId)
    .filter((preset) => !preset.archived && preset.id !== "inbox")
    .toSorted(byPresetOrder)
    .map((preset) => {
      const resolved = resolvePreset(state.presets, preset.id);
      return { color: resolved.ok ? resolved.value.color : null, id: preset.id, name: preset.name };
    });

const projectOptions = (state: CoreState): readonly ComposerOption[] =>
  Object.values(state.projects.byId)
    .filter((project) => !project.archived)
    .map((project) => ({ color: project.color, id: project.id, name: project.name }))
    .toSorted((a, b) => a.name.localeCompare(b.name));

/** The categories and projects a task form offers (the composer's and the editor's). */
export const taskFormOptions = (
  state: CoreState,
): {
  readonly presets: readonly ComposerOption[];
  readonly projects: readonly ComposerOption[];
  /** Each category's own estimate: what a task without one of its own counts with. */
  readonly estimates: Readonly<Record<string, number>>;
} => {
  const presets = presetOptions(state);
  return {
    estimates: Object.fromEntries(
      presets.flatMap((option) => {
        const resolved = resolvePreset(state.presets, option.id);
        return resolved.ok ? [[option.id, resolved.value.defaultEstimateMinutes]] : [];
      }),
    ),
    presets,
    projects: projectOptions(state),
  };
};

const optionOf = (options: readonly ComposerOption[], id: null | string): ComposerOption | null =>
  options.find((option) => option.id === id) ?? null;

const defaultImportanceOf = (state: CoreState, presetId: string): Importance => {
  const resolved = resolvePreset(state.presets, presetId);
  return resolved.ok ? resolved.value.defaultImportance : "normal";
};

/** A tap wins over the text; a tap on "none" is `null`, which `??` would skip. */
const pick = <T>(edit: null | T | undefined, parsed: null | T): null | T =>
  edit === undefined ? parsed : edit;

/** The composer's input: the typed line and the chips the user tapped. */
export type ComposerDraft = { readonly text: string; readonly edits?: ComposerEdits | undefined };

type Parsed = ReturnType<typeof parseQuickInput>;

const chosenPreset = (state: CoreState, parsed: Parsed, edits: ComposerEdits): string =>
  edits.presetId !== undefined && presetById(state.presets, edits.presetId) !== undefined
    ? edits.presetId
    : parsed.presetId;

const dueOf = (parsed: Parsed, edits: ComposerEdits): ComposerModel["due"] =>
  pick(
    edits.due,
    parsed.dueAt === null || parsed.dueTz === null ? null : { at: parsed.dueAt, tz: parsed.dueTz },
  );

const linkOf = (parsed: Parsed, edits: ComposerEdits): null | TaskLink => {
  const link = pick(edits.link, parsed.link);
  return link === null || !isHttpUrl(link) ? null : { host: linkHost(link), url: link };
};

const projectOf = (
  state: CoreState,
  projects: readonly ComposerOption[],
  projectId: null | string,
): ComposerOption | null =>
  projectId === null || projectById(state.projects, projectId) === undefined
    ? null
    : optionOf(projects, projectId);

/** A picked project wins over any name; otherwise a name the assistant gave, then the text's `#name`. */
const newProjectNameOf = (parsed: Parsed, edits: ComposerEdits): null | string => {
  if (edits.projectId !== undefined) {
    return null;
  }
  return edits.projectName === undefined ? parsed.projectName : edits.projectName;
};

/**
Where the text goes: a tapped week (or a tapped "a task of its own"), else the week the due
points at (none for a due on another day), else the nearest open week of the course.
*/
const targetOf = (
  state: CoreState,
  presetId: string,
  input: {
    readonly due: ComposerModel["due"];
    readonly now: string;
    readonly picked: null | string | undefined;
  },
): ComposerTarget => {
  const { due, now, picked } = input;
  const instance =
    picked === undefined
      ? openInstanceOf(state, presetId, { due, now })
      : openInstancesOf(state, presetId).find((task) => task.id === picked);
  return instance === undefined
    ? { kind: "new" }
    : { kind: "instance", taskId: instance.id, title: instance.title };
};

/**
The live reading of the composer: the rule parse of the text with the user's chip taps on
top. Picking another category preselects its default importance unless the text or a tap
named one.
*/
/** From this length (or a second line) Enter waits for the assistant instead of the rules alone. */
export const LONG_TEXT_CHARS = 80;

/** Shorter than this there is nothing for the assistant to read yet. */
const MIN_AI_CHARS = 3;

/** From this many characters arriving at once the change is a paste, not typing. */
const PASTE_CHARS = 20;

/** A paste (a message, a homework) is read by the assistant at once; typing is not. */
export const isPasted = (previous: string, next: string): boolean =>
  next.length - previous.length >= PASTE_CHARS;

/** Shorter text has nothing for the assistant to read. */
export const canAiRead = (text: string): boolean => text.trim().length >= MIN_AI_CHARS;

/** Long or multi-line text (a pasted homework, a forwarded message) is never added on the rules alone. */
export const requiresAiFirst = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed.length >= LONG_TEXT_CHARS || trimmed.includes("\n");
};

export const composerModel = (
  state: CoreState,
  draft: ComposerDraft,
  ctx: QueryContext,
): ComposerModel => {
  const { text } = draft;
  const edits = draft.edits ?? {};
  const parsed = parseQuickInput(text, state, ctx);
  const presets = presetOptions(state);
  const projects = projectOptions(state);
  const presetId = chosenPreset(state, parsed, edits);
  const defaultImportance = defaultImportanceOf(state, presetId);
  const textImportance = parsed.isImportanceExplicit ? parsed.importance : undefined;
  const due = dueOf(parsed, edits);
  return {
    defaultImportance,
    description: edits.description ?? null,
    due,
    start: edits.start ?? null,
    estimateMinutes: pick(edits.estimateMinutes, parsed.estimateMinutes),
    importance: edits.importance ?? textImportance ?? defaultImportance,
    isEmpty: text.trim() === "",
    link: linkOf(parsed, edits),
    newProjectName: newProjectNameOf(parsed, edits),
    preset: optionOf(presets, presetId) ?? { color: null, id: presetId, name: presetId },
    presets,
    project: projectOf(state, projects, pick(edits.projectId, parsed.projectId)),
    projects,
    spans: parsed.spans,
    subtasks: edits.subtasks ?? parsed.subtasks,
    target: targetOf(state, presetId, { due, now: ctx.now, picked: edits.targetTaskId }),
    instances: openInstancesOf(state, presetId).map((task) => ({ id: task.id, title: task.title })),
    text,
    title: edits.title ?? parsed.title,
  };
};
