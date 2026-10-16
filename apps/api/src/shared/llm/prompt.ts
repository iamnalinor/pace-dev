import {
  accountTz,
  ACTION_KINDS,
  type ActionContext,
  ACTIVITY_CATEGORIES,
  type CoreState,
  formatInZone,
  type Language,
  openInstancesOf,
  type ParseRequestBody,
  type Preset,
  type QueryContext,
  type RequestDomain,
  resolvePreset,
} from "@pace/core";

/** Keep context compact for endpoints with modest context and request budgets. */
export const PROMPT_TOKEN_BUDGET = 3000;

/** A rough count (4 characters a token) that is safe for budgeting. */
export const approxTokens = (text: string): number => Math.ceil(text.length / 4);

/** The line of the prompt that says which field the message came from (the fake model reads it). */
export const DOMAIN_LINES: Readonly<Record<RequestDomain, string>> = {
  activity: "Domain: activity (typed into the time tracker). Answer domain activity, confidence 1.",
  auto: "Domain: decide. Answer domain task (something to do) or activity (time spent: done or going on), and confidence 0..1 for how sure you are.",
  task: "Domain: task (typed into the task list). Answer domain task, confidence 1.",
};

const RULES = `You read one message from the owner of a personal task and time tracker and answer with JSON: what to do with it.
Rules:
- actions: usually one; several only when the message asks for several. kind is one of ${ACTION_KINDS.join(", ")}.
- Existing items only by their alias from the lists below (task: "t3", activity: "a2"); never invent one. A delete also copies the item's title, as listed, into quote.
- title: a short name (at most 60 characters) in the message's language, e.g. "ДЗ по алгебре: №290–534" for a pasted homework. Never translate it.
- Copy every other string (project, description, subtask labels) verbatim from the message. Never translate, fix or rephrase it.
- description: the message's instructions beyond the title and the problem numbers, copied verbatim; null when there are none.
- Weekly homework: pick that course's category (marked "weekly homework" below); leave dueDate and dueTime null unless the message names a deadline.
- Homework: every problem number is one subtask (label = the number as written, e.g. "290", "5а"); a task described in words is one subtask with those words.
- category: for a task an id from Categories, for an activity one of ${ACTIVITY_CATEGORIES.join(", ")}; null when unsure.
- project: only a name from Projects below; null if the requested project is not in the list. Never propose a new project. importance only when the message says it.
- link: a web address the message gives, verbatim.
- task.update: only the fields that change; clear lists what to empty; subtasks to add, subtaskRefs (label or number) to remove, renames. task.markSubtasks: subtaskRefs solved. task.close: outcome.
- activity.log: time already spent, with start and end. activity.start: going on now (start only when it began earlier; expectMinutes when a length is said). activity.update: start, end, label or category. label: 2–4 words in the message's language. Times are "YYYY-MM-DD HH:MM" on the clock below.
- Never invent numbers, dates or times. For dueDate, dueTime, estimateMinutes, expectMinutes, start and end add an evidence entry quoting the exact words they come from.
- When something is ambiguous, ask in questions with options, in the interface language.`;

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

const taskLines = (context: ActionContext): string =>
  context.tasks.map((task) => `- ${task.alias}: ${task.title}`).join("\n");

const activityLines = (context: ActionContext, zone: string): string =>
  context.activities
    .map((activity) => {
      const start = formatInZone(activity.startAt, zone, "yyyy-MM-dd HH:mm");
      const end = activity.endAt === null ? "now" : formatInZone(activity.endAt, zone, "HH:mm");
      return `- ${activity.alias}: ${start}–${end} ${activity.label} (${activity.category})`;
    })
    .join("\n");

export type ParsePrompt = { readonly system: string; readonly prompt: string };

const orNone = (lines: string): string => (lines === "" ? "(none)" : lines);

/**
The instructions plus what the model must know: the field the message came from, now, the
categories and projects, and the open tasks and recent activities under the aliases of
`context` (the same context maps the answer back).
*/
export const buildParsePrompt = (
  text: string,
  world: {
    readonly state: CoreState;
    readonly ctx: QueryContext;
    readonly language: Language;
    readonly domain: RequestDomain;
    readonly context: ActionContext;
    readonly thread?: ParseRequestBody["thread"];
  },
): ParsePrompt => {
  const { context, ctx, domain, language, state, thread } = world;
  const zone = accountTz(state, ctx);
  const system = [
    RULES,
    DOMAIN_LINES[domain],
    `Now: ${formatInZone(ctx.now, zone, "yyyy-MM-dd HH:mm, EEEE")} (${zone}). Interface language: ${language}.`,
    `Categories:\n${presetLines(state, zone)}`,
    `Projects:\n${orNone(projectLines(state))}`,
    `Open tasks:\n${orNone(taskLines(context))}`,
    `Activities (today and yesterday):\n${orNone(activityLines(context, zone))}`,
    ...(thread === undefined || thread.length === 0
      ? []
      : [
          `Conversation so far (oldest first):\n${thread
            .map(
              (turn, index) =>
                `${String(index + 1)}. Owner: ${turn.text}\nActions shown: ${orNone(turn.actions.map((action) => action.summary).join("; "))}`,
            )
            .join("\n")}`,
          "The latest message corrects the earlier actions. Return the complete revised set of actions, not a diff. Nothing has been applied yet.",
        ]),
  ].join("\n\n");
  return { prompt: text, system };
};
