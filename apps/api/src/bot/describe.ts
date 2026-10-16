import {
  type Action,
  type CoreState,
  formatDuration,
  type Language,
  type MessageKey,
  openInstanceOf,
  type ParseField,
  presetById,
  projectById,
  resolvePreset,
  t,
  type TaskDraft,
} from "@pace/core";

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

type Line = {
  readonly field: null | ParseField;
  readonly label: string;
  readonly value: null | string;
};

/** The importance the task gets: its own, else its category's default. */
const importanceOf = (task: TaskDraft, state: CoreState) => {
  const resolved = resolvePreset(state.presets, task.presetId);
  return task.importance ?? (resolved.ok ? resolved.value.defaultImportance : null);
};

const createLines = (task: TaskDraft, state: CoreState, language: Language): readonly Line[] => {
  const preset = presetById(state.presets, task.presetId);
  const project = task.projectId === null ? undefined : projectById(state.projects, task.projectId);
  const importance = importanceOf(task, state);
  const line = (field: Line["field"], key: MessageKey, value: Line["value"]): Line => ({
    field,
    label: t(language, key),
    value,
  });
  return [
    line("title", "bot.field.title", task.title),
    line("category", "bot.field.category", preset?.name ?? task.presetId),
    line("project", "bot.field.project", project?.name ?? task.projectName),
    line("dueDate", "bot.field.due", dueText(task, language)),
    line(
      "estimateMinutes",
      "bot.field.estimate",
      task.estimateMinutes === null ? null : formatDuration(task.estimateMinutes, language),
    ),
    line(
      null,
      "bot.field.importance",
      importance === null ? null : t(language, `importance.${importance}`),
    ),
    line(
      "subtasks",
      "bot.field.subtasks",
      task.subtasks.length === 0 ? null : task.subtasks.map((subtask) => subtask.label).join(", "),
    ),
  ];
};

type Extras = {
  readonly state: CoreState;
  readonly language: Language;
  readonly now: string;
};

/** A new task as its fields, doubtful ones marked; or the course week it is added to. */
const describeCreate = (
  action: Extract<Action, { kind: "task.create" }>,
  { language, now, state }: Extras,
): string => {
  const doubtful = action.doubtful ?? [];
  const { task } = action;
  const due =
    task.dueAt === null || task.dueTz === null ? null : { at: task.dueAt, tz: task.dueTz };
  const instance = openInstanceOf(state, task.presetId, { due, now });
  const lines = createLines(task, state, language)
    .filter((line) => line.value !== null)
    .map((line) => {
      const mark =
        line.field !== null && doubtful.includes(line.field)
          ? ` ${t(language, "bot.doubtful")}`
          : "";
      return `${line.label}: ${line.value ?? ""}${mark}`;
    });
  const header =
    instance === undefined
      ? t(language, "bot.preview")
      : t(language, "bot.addTo", { title: instance.title });
  return [header, ...lines].join("\n");
};

/**
The preview message: a new task as its fields (doubtful ones marked), anything else by its
summary, then the assistant's questions.
*/
export const describeActions = (
  actions: readonly Action[],
  extras: Extras & { readonly questions: readonly string[] },
): string => {
  const { language, questions } = extras;
  const asked = questions.map((question) => t(language, "bot.question", { question }));
  const described = actions.map((action) =>
    action.kind === "task.create" ? describeCreate(action, extras) : action.summary,
  );
  return [...described, ...asked].join("\n");
};
