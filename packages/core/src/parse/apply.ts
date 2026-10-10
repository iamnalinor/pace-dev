import { TZDate } from "@date-fns/tz";

import type { CoreState } from "../materialize/core-state.ts";
import type { ParseResult } from "./schema.ts";
import type { VerifiedParse } from "./verify.ts";

import { type EventBody, subtasksAddedBodies } from "../input/bodies.ts";
import { parseQuickInput, type QuickInput } from "../input/parse-quick-input.ts";
import { extractLink } from "../links.ts";
import { findProjectByName } from "../model/project.ts";
import { isOpen, type Task } from "../model/task.ts";
import { presetById } from "../presets/preset-reducer.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";
import { accountTz, type QueryContext } from "../queries/context.ts";
import { err, ok, type Result } from "../result.ts";

/** An event without its envelope: the caller stamps it with its source and instant. */
export type { EventBody } from "../input/bodies.ts";

export type ParseApplyError =
  | "parse/ambiguous-task"
  | "parse/no-subtasks"
  | "parse/unknown-intent"
  | "parse/unknown-task";

/** What a parse turns into: a new task (shown as chips first), or changes to an existing one. */
export type ParsePlan =
  | { readonly kind: "create"; readonly input: QuickInput }
  | {
      readonly kind: "update";
      readonly taskId: string;
      readonly title: string;
      readonly bodies: readonly EventBody[];
    };

const END_OF_DAY = "23:59";

/** `2026-10-07` + `18:00` on the wall clock of `zone`, as an instant. */
export const wallClockInstant = (date: string, time: string, zone: string): string => {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Date(new TZDate(year, month - 1, day, hours, minutes, zone)).toISOString();
};

const presetOf = (state: CoreState, category: null | string): string | undefined => {
  if (category === null) {
    return undefined;
  }
  const byId = presetById(state.presets, category);
  if (byId !== undefined && !byId.archived) {
    return byId.id;
  }
  const lower = category.toLowerCase();
  return Object.values(state.presets.byId).find(
    (preset) => !preset.archived && preset.name.toLowerCase() === lower,
  )?.id;
};

const projectOf = (
  state: CoreState,
  name: null | string,
  fallback: QuickInput,
): Pick<QuickInput, "projectId" | "projectName"> => {
  if (name === null || name.trim() === "") {
    return { projectId: fallback.projectId, projectName: fallback.projectName };
  }
  const existing = findProjectByName(state.projects, name);
  return existing === undefined
    ? { projectId: null, projectName: name.trim() }
    : { projectId: existing.id, projectName: null };
};

/** The LLM's date and time read on the account's wall clock; the rules' reading otherwise. */
const dueOf = (
  result: ParseResult,
  rules: QuickInput,
  zone: string,
): Pick<QuickInput, "dueAt" | "dueTz"> => {
  const dueAt =
    result.dueDate === null
      ? rules.dueAt
      : wallClockInstant(result.dueDate, result.dueTime ?? END_OF_DAY, zone);
  return { dueAt, dueTz: dueAt === null ? null : (rules.dueTz ?? zone) };
};

/** An importance the LLM or the text named wins; otherwise the category's default. */
const importanceOf = (
  result: ParseResult,
  rules: QuickInput,
  preset: ReturnType<typeof resolvePreset>,
): Pick<QuickInput, "importance" | "isImportanceExplicit"> => {
  const defaultImportance = preset.ok ? preset.value.defaultImportance : rules.importance;
  return {
    importance:
      result.importance ?? (rules.isImportanceExplicit ? rules.importance : defaultImportance),
    isImportanceExplicit: result.importance !== null || rules.isImportanceExplicit,
  };
};

/**
The LLM's reading as the composer's fields: what it found wins, the rule-based reading
fills the rest, so the same chips show either way. The source text is kept verbatim.
*/
export const parseToQuickInput = (
  verified: VerifiedParse,
  text: string,
  { ctx, state }: { readonly state: CoreState; readonly ctx: QueryContext },
): QuickInput => {
  const { result } = verified;
  const rules = parseQuickInput(text, state, ctx);
  const presetId = presetOf(state, result.category) ?? rules.presetId;
  return {
    ...rules,
    ...projectOf(state, result.project, rules),
    ...dueOf(result, rules, accountTz(state, ctx)),
    ...importanceOf(result, rules, resolvePreset(state.presets, presetId)),
    description: result.description,
    estimateMinutes: result.estimateMinutes ?? rules.estimateMinutes,
    link: extractLink(text),
    presetId,
    spans: [],
    subtasks: result.subtasks.length === 0 ? rules.subtasks : result.subtasks,
    title: result.title ?? rules.title,
  };
};

type Found = Result<Task, "parse/ambiguous-task" | "parse/unknown-task">;

/** The open task a message refers to: by id, else the one open task whose title matches. */
export const findTaskRef = (state: CoreState, ref: null | string): Found => {
  if (ref === null || ref.trim() === "") {
    return err("parse/unknown-task");
  }
  const byId = state.tasks.byId[ref];
  if (byId !== undefined) {
    return ok(byId);
  }
  const lower = ref.trim().toLowerCase();
  const open = Object.values(state.tasks.byId).filter(isOpen);
  const exact = open.filter((task) => task.title.toLowerCase() === lower);
  const partial = open.filter((task) => task.title.toLowerCase().includes(lower));
  const matches = exact.length > 0 ? exact : partial;
  const [only, ...rest] = matches;
  if (only === undefined) {
    return err("parse/unknown-task");
  }
  return rest.length === 0 ? ok(only) : err("parse/ambiguous-task");
};

const isSubtaskNamed = (label: string, subtask: Task["subtasks"][number]): boolean =>
  subtask.label.toLowerCase() === label.toLowerCase() || String(subtask.number) === label;

type UpdateBuilder = (
  task: Task,
  verified: VerifiedParse,
  text: string,
) => Result<readonly EventBody[], ParseApplyError>;

const addToTask: UpdateBuilder = (task, { result }, text) =>
  ok([
    ...subtasksAddedBodies(
      task.id,
      result.subtasks,
      (index) => `${task.id}:${String(task.subtasks.length + index + 1)}`,
    ),
    { type: "task.source.attached", payload: { taskId: task.id, sourceText: text } } as const,
  ]);

const markSubtasks: UpdateBuilder = (task, { result }) => {
  const ids = task.subtasks
    .filter((subtask) => subtask.solvedAt === null)
    .filter((subtask) => result.subtasks.some((wanted) => isSubtaskNamed(wanted.label, subtask)))
    .map((subtask) => subtask.id);
  return ids.length === 0
    ? err("parse/no-subtasks")
    : ok(
        ids.map(
          (subtaskId) =>
            ({ type: "task.subtask.solved", payload: { subtaskId, taskId: task.id } }) as const,
        ),
      );
};

const closeTask: UpdateBuilder = (task, { result }) =>
  ok([
    {
      type: "task.closed",
      payload: { outcome: result.outcome ?? "done", taskId: task.id },
    } as const,
  ]);

const UPDATES: Readonly<Record<"add_to_task" | "close_task" | "mark_subtasks", UpdateBuilder>> = {
  add_to_task: addToTask,
  close_task: closeTask,
  mark_subtasks: markSubtasks,
};

/** What to do with a verified parse; event bodies only, the caller stamps and applies them. */
export const planParse = (
  verified: VerifiedParse,
  text: string,
  world: { readonly state: CoreState; readonly ctx: QueryContext },
): Result<ParsePlan, ParseApplyError> => {
  const { intent } = verified.result;
  if (intent === "unknown") {
    return err("parse/unknown-intent");
  }
  if (intent === "create_task") {
    return ok({ input: parseToQuickInput(verified, text, world), kind: "create" });
  }
  const task = findTaskRef(world.state, verified.result.task);
  if (!task.ok) {
    return task;
  }
  const bodies = UPDATES[intent](task.value, verified, text);
  return bodies.ok
    ? ok({ bodies: bodies.value, kind: "update", taskId: task.value.id, title: task.value.title })
    : bodies;
};
