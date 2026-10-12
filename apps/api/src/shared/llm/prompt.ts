import {
  accountTz,
  type CoreState,
  formatInZone,
  isOpen,
  type Language,
  openInstancesOf,
  PARSE_INTENTS,
  type Preset,
  type QueryContext,
  resolvePreset,
} from "@pace/core";

/** Groq's free tier allows 8k tokens a minute: the prompt stays well under half of it. */
export const PROMPT_TOKEN_BUDGET = 3000;

/** A rough count (4 characters a token) that is safe for budgeting. */
export const approxTokens = (text: string): number => Math.ceil(text.length / 4);

const MAX_OPEN_TASKS = 40;
const TITLE_CHARS = 60;

const RULES = `You turn one message from a personal task tracker's owner into JSON.
Rules:
- title: a short name for the task (at most 60 characters) in the message's language, e.g. "ДЗ по алгебре: №290–534" for a pasted homework. Never translate it. The full message is kept as the task's source.
- Copy every other string you extract (project, description, subtask labels) verbatim from the message. Never translate, fix or rephrase it.
- description: the message's instructions beyond the title and the problem numbers (how to solve, what to submit, hints), copied verbatim; null when there are none.
- Weekly homework: pick that course's category (marked "weekly homework" below). Its deadline comes from the course's rhythm, so leave dueDate and dueTime null unless the message itself names a deadline.
- estimateMinutes only when the message says how long it takes.
- Homework: every problem number is one subtask (label = the number as written, e.g. "290", "5а"); a task described in words ("Задача на листе") is one subtask with those words as its label.
- Never invent numbers or dates. For dueDate, dueTime and estimateMinutes add an evidence entry quoting the exact words they come from.
- category is an id from the list below; leave it null when unsure. Do not guess what a category defines.
- project: a name from the list, or a new name only when the message names one.
- importance only when the message says it (urgent, important, someday...).
- intent: ${PARSE_INTENTS.join(", ")}. add_to_task, mark_subtasks and close_task need task: an id from the open tasks.
- When something is ambiguous (e.g. "5a" or "5"), ask in questions with options, in the interface language.`;

const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MAX_OPEN_WEEKS = 3;

/** A weekly course's rhythm and its open weeks, so a pasted homework lands on the right one. */
const courseNote = (state: CoreState, preset: Preset, zone: string): string => {
  const resolved = resolvePreset(state.presets, preset.id);
  if (!resolved.ok || resolved.value.recurrence === null) {
    return "";
  }
  const { due } = resolved.value.recurrence;
  const weeks = openInstancesOf(state, preset.id)
    .slice(0, MAX_OPEN_WEEKS)
    .map((task) =>
      task.dueAt === null
        ? task.title
        : `${task.title}, due ${formatInZone(task.dueAt, zone, "yyyy-MM-dd HH:mm")}`,
    );
  return ` (weekly homework, due ${WEEKDAYS[due.weekday]} ${due.time}, about ${String(resolved.value.defaultEstimateMinutes)} min; open: ${weeks.length === 0 ? "none" : weeks.join("; ")})`;
};

const presetLines = (state: CoreState, zone: string): string =>
  Object.values(state.presets.byId)
    .filter((preset) => !preset.archived && preset.id !== "inbox")
    .map((preset) => `- ${preset.id}: ${preset.name}${courseNote(state, preset, zone)}`)
    .join("\n");

const projectLines = (state: CoreState): string =>
  Object.values(state.projects.byId)
    .filter((project) => !project.archived)
    .map((project) => `- ${project.name}`)
    .join("\n");

const taskLines = (state: CoreState): string =>
  Object.values(state.tasks.byId)
    .filter(isOpen)
    .toSorted((a, b) => b.lastEventAt.localeCompare(a.lastEventAt))
    .slice(0, MAX_OPEN_TASKS)
    .map((task) => `- ${task.id}: ${task.title.slice(0, TITLE_CHARS)}`)
    .join("\n");

export type ParsePrompt = { readonly system: string; readonly prompt: string };

/** The instructions plus what the model must know: categories, projects, open tasks, now. */
const orNone = (lines: string): string => (lines === "" ? "(none)" : lines);

export const buildParsePrompt = (
  text: string,
  world: { readonly state: CoreState; readonly ctx: QueryContext; readonly language: Language },
): ParsePrompt => {
  const { ctx, language, state } = world;
  const zone = accountTz(state, ctx);
  const system = [
    RULES,
    `Now: ${formatInZone(ctx.now, zone, "yyyy-MM-dd HH:mm, EEEE")} (${zone}). Interface language: ${language}.`,
    `Categories:\n${presetLines(state, zone)}`,
    `Projects:\n${orNone(projectLines(state))}`,
    `Open tasks:\n${orNone(taskLines(state))}`,
  ].join("\n\n");
  return { prompt: text, system };
};
