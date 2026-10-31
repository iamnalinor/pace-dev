import {
  type Action,
  actionDetails,
  type CoreState,
  detailText,
  type Language,
  openInstanceOf,
  type ParseQuestion,
  summaryDetails,
  t,
} from "@pace/core";

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
  const { task } = action;
  const due =
    task.dueAt === null || task.dueTz === null ? null : { at: task.dueAt, tz: task.dueTz };
  const instance = openInstanceOf(state, task.presetId, { due, now });
  const lines = actionDetails(action, { language, state }).map((line) =>
    detailText(line, language),
  );
  const header =
    instance === undefined
      ? t(language, "bot.preview")
      : t(language, "bot.addTo", { title: instance.title });
  return [header, ...lines].join("\n");
};

/** Anything but a new task: its summary, then what it sets (an activity's category…). */
const describeOther = (action: Action, { language, state }: Extras): string =>
  [
    action.summary,
    ...summaryDetails(action, { language, state }).map((line) => detailText(line, language)),
  ].join("\n");

/** Questions are numbered once more than one has options: their buttons carry the number. */
export const isNumbered = (questions: readonly ParseQuestion[]): boolean =>
  questions.filter((question) => question.options.length > 0).length > 1;

/** The assistant's questions, numbered when needed, and how to answer them if they have options. */
const describeQuestions = (
  questions: readonly ParseQuestion[],
  language: Language,
): readonly string[] => {
  const isNumberedList = isNumbered(questions);
  const asked = questions.map(({ question }, index) =>
    isNumberedList
      ? t(language, "bot.questionNumbered", { number: String(index + 1), question })
      : t(language, "bot.question", { question }),
  );
  return questions.some((question) => question.options.length > 0)
    ? [...asked, t(language, "bot.answerHint")]
    : asked;
};

/**
The preview message: a new task as its fields (doubtful ones marked), anything else by its
summary and what it sets, as the app's cards show it, then the assistant's questions.
*/
export const describeActions = (
  actions: readonly Action[],
  extras: Extras & { readonly questions: readonly ParseQuestion[] },
): string => {
  const { language, questions } = extras;
  const described = actions.map((action) =>
    action.kind === "task.create" ? describeCreate(action, extras) : describeOther(action, extras),
  );
  return [...described, ...describeQuestions(questions, language)].join("\n");
};
