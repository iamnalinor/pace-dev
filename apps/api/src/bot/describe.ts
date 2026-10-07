import {
  type CoreState,
  type EventBody,
  formatDuration,
  type Language,
  type MessageKey,
  type ParseField,
  type ParsePlan,
  presetById,
  projectById,
  type QuickInput,
  t,
} from "@pace/core";

const dueText = (input: QuickInput, language: Language): null | string =>
  input.dueAt === null || input.dueTz === null
    ? null
    : new Intl.DateTimeFormat(language, {
        day: "numeric",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "short",
        timeZone: input.dueTz,
        weekday: "short",
      }).format(new Date(input.dueAt));

type Line = {
  readonly field: null | ParseField;
  readonly label: string;
  readonly value: null | string;
};

const createLines = (input: QuickInput, state: CoreState, language: Language): readonly Line[] => {
  const preset = presetById(state.presets, input.presetId);
  const project =
    input.projectId === null ? undefined : projectById(state.projects, input.projectId);
  const line = (field: Line["field"], key: MessageKey, value: Line["value"]): Line => ({
    field,
    label: t(language, key),
    value,
  });
  return [
    line("title", "bot.field.title", input.title === "" ? input.text : input.title),
    line("category", "bot.field.category", preset?.name ?? input.presetId),
    line("project", "bot.field.project", project?.name ?? input.projectName),
    line("dueDate", "bot.field.due", dueText(input, language)),
    line(
      "estimateMinutes",
      "bot.field.estimate",
      input.estimateMinutes === null ? null : formatDuration(input.estimateMinutes, language),
    ),
    line(null, "bot.field.importance", t(language, `importance.${input.importance}`)),
    line(
      "subtasks",
      "bot.field.problems",
      input.subtasks.length === 0
        ? null
        : input.subtasks.map((subtask) => subtask.label).join(", "),
    ),
  ];
};

const problemsOf = (bodies: readonly EventBody[], state: CoreState, taskId: string): string => {
  const task = state.tasks.byId[taskId];
  const labelsOf = (body: EventBody): readonly string[] => {
    if (body.type === "task.subtask.solved") {
      const subtask = task?.subtasks.find((item) => item.id === body.payload.subtaskId);
      return [subtask === undefined ? body.payload.subtaskId : subtask.label];
    }
    return body.type === "task.subtasks.added"
      ? body.payload.subtasks.map((subtask) => subtask.label)
      : [];
  };
  return bodies.flatMap((body) => labelsOf(body)).join(", ");
};

const updateText = (
  plan: Extract<ParsePlan, { kind: "update" }>,
  state: CoreState,
  language: Language,
): string => {
  const first = plan.bodies[0];
  const problems = problemsOf(plan.bodies, state, plan.taskId);
  if (first?.type === "task.closed") {
    return t(language, "bot.close", {
      outcome: t(language, `outcome.${first.payload.outcome}`),
      title: plan.title,
    });
  }
  return t(language, first?.type === "task.subtask.solved" ? "bot.markSolved" : "bot.addProblems", {
    problems,
    title: plan.title,
  });
};

/** The preview message: what will be written, doubtful fields marked, questions asked. */
export const describePlan = (
  plan: ParsePlan,
  extras: {
    readonly state: CoreState;
    readonly language: Language;
    readonly doubtful: readonly ParseField[];
    readonly questions: readonly string[];
    readonly instanceTitle: null | string;
  },
): string => {
  const { doubtful, language, questions, state } = extras;
  const asked = questions.map((question) => t(language, "bot.question", { question }));
  if (plan.kind === "update") {
    return [updateText(plan, state, language), ...asked].join("\n");
  }
  const lines = createLines(plan.input, state, language)
    .filter((line) => line.value !== null)
    .map((line) => {
      const mark =
        line.field !== null && doubtful.includes(line.field)
          ? ` ${t(language, "bot.doubtful")}`
          : "";
      return `${line.label}: ${line.value ?? ""}${mark}`;
    });
  const header =
    extras.instanceTitle === null
      ? t(language, "bot.preview")
      : t(language, "bot.addTo", { title: extras.instanceTitle });
  return [header, ...lines, ...asked].join("\n");
};
