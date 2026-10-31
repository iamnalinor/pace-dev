import {
  type Action,
  actionDetails,
  type CoreState,
  detailText,
  type Language,
  openInstanceOf,
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

/**
The preview message: a new task as its fields (doubtful ones marked), anything else by its
summary and what it sets, as the app's cards show it, then the assistant's questions.
*/
export const describeActions = (
  actions: readonly Action[],
  extras: Extras & { readonly questions: readonly string[] },
): string => {
  const { language, questions } = extras;
  const asked = questions.map((question) => t(language, "bot.question", { question }));
  const described = actions.map((action) =>
    action.kind === "task.create" ? describeCreate(action, extras) : describeOther(action, extras),
  );
  return [...described, ...asked].join("\n");
};
