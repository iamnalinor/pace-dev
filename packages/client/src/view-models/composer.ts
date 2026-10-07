import {
  type CoreState,
  type Importance,
  isOpen,
  linkHost,
  parseQuickInput,
  presetById,
  projectById,
  type ProjectColorName,
  type QueryContext,
  type QuickSpan,
  type QuickSubtask,
  resolvePreset,
  type Task,
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
  readonly estimateMinutes: null | number;
  readonly link: null | TaskLink;
  readonly subtasks: readonly QuickSubtask[];
  /** Which part of the text produced each chip, for highlighting. */
  readonly spans: readonly QuickSpan[];
  readonly target: ComposerTarget;
};

const presetOptions = (state: CoreState): readonly ComposerOption[] =>
  Object.values(state.presets.byId)
    .filter((preset) => !preset.archived && preset.id !== "inbox")
    .map((preset) => {
      const resolved = resolvePreset(state.presets, preset.id);
      return { color: resolved.ok ? resolved.value.color : null, id: preset.id, name: preset.name };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));

const projectOptions = (state: CoreState): readonly ComposerOption[] =>
  Object.values(state.projects.byId)
    .filter((project) => !project.archived)
    .map((project) => ({ color: project.color, id: project.id, name: project.name }))
    .toSorted((a, b) => a.name.localeCompare(b.name));

const optionOf = (options: readonly ComposerOption[], id: null | string): ComposerOption | null =>
  options.find((option) => option.id === id) ?? null;

const byDue = (a: Task, b: Task): number => (a.dueAt ?? "").localeCompare(b.dueAt ?? "");

/** The open homework of a recurring course closest to its due: problems typed for it go there. */
const instanceOf = (state: CoreState, presetId: string, now: string): Task | undefined => {
  const resolved = resolvePreset(state.presets, presetId);
  if (!resolved.ok || resolved.value.recurrence === null) {
    return undefined;
  }
  const open = Object.values(state.tasks.byId)
    .filter((task) => task.presetId === presetId && isOpen(task) && task.id.startsWith("hw:"))
    .toSorted(byDue);
  return open.find((task) => task.dueAt !== null && task.dueAt >= now) ?? open.at(-1);
};

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
  return link === null ? null : { host: linkHost(link), url: link };
};

const projectOf = (
  state: CoreState,
  projects: readonly ComposerOption[],
  projectId: null | string,
): ComposerOption | null =>
  projectId === null || projectById(state.projects, projectId) === undefined
    ? null
    : optionOf(projects, projectId);

const targetOf = (state: CoreState, presetId: string, now: string): ComposerTarget => {
  const instance = instanceOf(state, presetId, now);
  return instance === undefined
    ? { kind: "new" }
    : { kind: "instance", taskId: instance.id, title: instance.title };
};

/**
The live reading of the composer: the rule parse of the text with the user's chip taps on
top. Picking another category preselects its default importance unless the text or a tap
named one.
*/
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
  return {
    defaultImportance,
    due: dueOf(parsed, edits),
    estimateMinutes: pick(edits.estimateMinutes, parsed.estimateMinutes),
    importance: edits.importance ?? textImportance ?? defaultImportance,
    isEmpty: text.trim() === "",
    link: linkOf(parsed, edits),
    newProjectName: edits.projectId === undefined ? parsed.projectName : null,
    preset: optionOf(presets, presetId) ?? { color: null, id: presetId, name: presetId },
    presets,
    project: projectOf(state, projects, pick(edits.projectId, parsed.projectId)),
    projects,
    spans: parsed.spans,
    subtasks: parsed.subtasks,
    target: targetOf(state, presetId, ctx.now),
    text,
    title: parsed.title,
  };
};
