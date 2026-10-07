import {
  accountTz,
  type CoreState,
  formatInZone,
  isOpen,
  type Language,
  PARSE_INTENTS,
  type QueryContext,
} from "@pace/core";

/** Groq's free tier allows 8k tokens a minute: the prompt stays well under half of it. */
export const PROMPT_TOKEN_BUDGET = 3000;

/** A rough count (4 characters a token) that is safe for budgeting. */
export const approxTokens = (text: string): number => Math.ceil(text.length / 4);

const MAX_OPEN_TASKS = 40;
const TITLE_CHARS = 60;

const RULES = `You turn one message from a personal task tracker's owner into JSON.
Rules:
- Copy every string you extract (title, project, description, subtask labels) verbatim from the message, in its language. Never translate, fix or rephrase it.
- Never invent numbers or dates. For dueDate, dueTime and estimateMinutes add an evidence entry quoting the exact words they come from.
- category is an id from the list below; leave it null when unsure. Do not guess what a category defines.
- project: a name from the list, or a new name only when the message names one.
- importance only when the message says it (urgent, important, someday...).
- intent: ${PARSE_INTENTS.join(", ")}. add_to_task, mark_subtasks and close_task need task: an id from the open tasks.
- When something is ambiguous (e.g. "5a" or "5"), ask in questions with options, in the interface language.`;

const presetLines = (state: CoreState): string =>
  Object.values(state.presets.byId)
    .filter((preset) => !preset.archived && preset.id !== "inbox")
    .map((preset) => `- ${preset.id}: ${preset.name}`)
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
    `Categories:\n${presetLines(state)}`,
    `Projects:\n${orNone(projectLines(state))}`,
    `Open tasks:\n${orNone(taskLines(state))}`,
  ].join("\n\n");
  return { prompt: text, system };
};
