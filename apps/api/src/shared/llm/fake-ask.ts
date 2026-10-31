import {
  blankModelAction,
  type ModelAction,
  type ModelOutput,
  type ParseQuestion,
  typedActivity,
} from "@pace/core";

import { DOMAIN_LINES } from "./prompt.ts";

/** The scripted model's `#ask` (fake-model.ts): a reading with questions to answer. */

const ASK = /^#ask (.+)$/iu;

/** What the fake asks of an `#ask` task: one question with options, one without. */
const ASK_QUESTIONS: readonly ParseQuestion[] = [
  {
    field: "dueDate",
    options: ["Today", "Tomorrow"],
    question: "By when does this need to be done?",
  },
  { field: "category", options: [], question: "Is this for work or home?" },
];

/** What the fake asks of an `#ask` activity: how long, with options. */
const ASK_LENGTH: ParseQuestion = {
  field: "expectMinutes",
  options: ["20m", "1h", "2h"],
  question: "How long will it take?",
};

/** An `#ask` activity started now, its length the one an answer named (`… — 1h`). */
const askedStart = (label: string, text: string): ModelAction => {
  const answered = text.includes(ASK_LENGTH.question)
    ? typedActivity(text.split(" — ").at(-1) ?? "").expectMinutes
    : null;
  return blankModelAction({
    category: "other",
    evidence: answered === null ? [] : [{ field: "expectMinutes", quote: text }],
    expectMinutes: answered,
    kind: "activity.start",
    label,
  });
};

/** The reading and what it asks, before the questions already answered are left out. */
const askedOf = (title: string, text: string, system: string): ModelOutput =>
  system.includes(DOMAIN_LINES.activity)
    ? {
        actions: [askedStart(title, text)],
        confidence: 1,
        domain: "activity",
        questions: [ASK_LENGTH],
      }
    : {
        actions: [blankModelAction({ kind: "task.create", title: title.trim() })],
        confidence: 1,
        domain: "task",
        questions: [...ASK_QUESTIONS],
      };

/**
`#ask <title>`: the questions a real model asks of an unclear message, so tests and e2e can
answer them: in the task field a new task (when? work or home?), in the activity field a start
(how long?). In a thread that began with `#ask`, the same again, asking only what the latest
message did not quote (an answer quotes its question). `undefined` for any other message.
*/
export const askReply = (text: string, system: string): ModelOutput | undefined => {
  const request = /^1\. Owner: (.+)$/mu.exec(system)?.[1] ?? text;
  const title = ASK.exec(request.trim())?.[1];
  if (title === undefined) {
    return undefined;
  }
  const asked = askedOf(title, text, system);
  return {
    ...asked,
    questions: asked.questions.filter((question) => !text.includes(question.question)),
  };
};
