import { answerAt, type Language, type ParseQuestion, t } from "@pace/core";

import { isNumbered } from "./describe.ts";
import { type BotReply, plain, type Turn } from "./turn.ts";

/** Callback data of the preview buttons: `<action>:<preview id>` (an option: see `answerRows`). */
export const PREVIEW_ACTIONS = {
  accept: "a",
  activity: "v",
  answer: "q",
  cancel: "c",
  inbox: "i",
  task: "t",
} as const;

/** Options per row of the keyboard: three short answers fit a phone's width. */
const OPTIONS_PER_ROW = 3;

/**
A row (or a few) of buttons per question with options, above Approve: a press answers it.
Numbered like the questions in the text when more than one has options. The data is
`q<question index><option index>:<preview id>` (at most 5 questions of 6 options: one digit
each), so it stays far below Telegram's 64 bytes whatever the option says; the text is looked
up in the preview on a press.
*/
const answerRows = (id: string, questions: readonly ParseQuestion[]): BotReply["buttons"] => {
  const isNumberedList = isNumbered(questions);
  return questions.flatMap((question, questionIndex) => {
    const buttons = question.options.map((option, optionIndex) => ({
      data: `${PREVIEW_ACTIONS.answer}${String(questionIndex)}${String(optionIndex)}:${id}`,
      label: isNumberedList ? `${String(questionIndex + 1)}. ${option}` : option,
    }));
    return Array.from({ length: Math.ceil(buttons.length / OPTIONS_PER_ROW) }, (_, row) =>
      buttons.slice(row * OPTIONS_PER_ROW, (row + 1) * OPTIONS_PER_ROW),
    );
  });
};

/** The questions' options (rows of their own), then Approve, To Inbox and Cancel. */
export const buttonsFor = (
  id: string,
  language: Language,
  {
    canAccept,
    canInbox,
    questions = [],
  }: {
    readonly canAccept: boolean;
    readonly canInbox: boolean;
    readonly questions?: readonly ParseQuestion[];
  },
): BotReply["buttons"] => [
  ...answerRows(id, questions),
  [
    ...(canAccept
      ? [{ data: `${PREVIEW_ACTIONS.accept}:${id}`, label: t(language, "bot.accept") }]
      : []),
    ...(canInbox
      ? [{ data: `${PREVIEW_ACTIONS.inbox}:${id}`, label: t(language, "bot.toInbox") }]
      : []),
    { data: `${PREVIEW_ACTIONS.cancel}:${id}`, label: t(language, "bot.cancel") },
  ],
];

/** A preview the assistant was not sure of: a task or an activity? */
export const domainButtons = (id: string, language: Language): BotReply["buttons"] => [
  [
    { data: `${PREVIEW_ACTIONS.task}:${id}`, label: t(language, "bot.domainTask") },
    { data: `${PREVIEW_ACTIONS.activity}:${id}`, label: t(language, "bot.domainActivity") },
    { data: `${PREVIEW_ACTIONS.cancel}:${id}`, label: t(language, "bot.cancel") },
  ],
];

/** `PREVIEW_ACTIONS.answer`, then the question's and the option's index. */
const ANSWER_ACTION = /^q(\d)(\d)$/u;

type At = { readonly question: number; readonly option: number };

/** The question and option a button's action points at; `undefined` for any other button. */
export const answerIndexes = (action: string): At | undefined => {
  const match = ANSWER_ACTION.exec(action);
  return match === null ? undefined : { option: Number(match[2]), question: Number(match[1]) };
};

/** A reading's questions; none when it has none (a rule-based one). */
export const questionsOf = (read: {
  readonly questions?: readonly ParseQuestion[];
}): readonly ParseQuestion[] => read.questions ?? [];

/** What an option button needs of the remembered preview. */
type Asked = { readonly questions?: readonly ParseQuestion[]; readonly awaitingChoice?: boolean };

/**
An option button: the same correction as a typed reply (`answerText`, the question quoted),
checked against the preview it belongs to. A press of a preview that is gone or of an option
it does not have is told in a toast and changes nothing; a revision that cannot be made now
keeps the preview and says why in an alert.
*/
export const answerPreview = async (
  turn: Turn,
  { at, id }: { readonly at: At; readonly id: string },
  revise: (text: string) => Promise<BotReply | null>,
): Promise<BotReply> => {
  const stale: BotReply = {
    ...plain(t(turn.state.settings.language, "bot.expired")),
    isToast: true,
  };
  const pending = (await turn.store.peek(id)) as Asked | undefined;
  const answer = answerAt(pending?.questions ?? [], at);
  if (pending?.awaitingChoice === true || !answer.ok) {
    return stale;
  }
  const reply = await revise(answer.value);
  if (reply === null) {
    return stale;
  }
  return reply.pendingId === undefined ? { ...reply, isRefused: true } : reply;
};
