import { type Action, decisionStepOf, plural, t } from "@pace/core";

import { lookupOf, type World } from "./decision-lookup.ts";
import { stepText } from "./decision-step-text.ts";

/**
What an approval did, one line per action in the log's past tense ("Created task “X”"), for the
toast after Approve that said only "Done" (QA round 11 L3); a step this client cannot word keeps
its summary.
*/
export const doneLines = (
  actions: readonly Action[],
  world: World,
  quote: (text: string) => string = (text) => text,
): readonly string[] => {
  const lookup = lookupOf(world);
  return actions.map(
    (action) =>
      stepText(decisionStepOf(action), {
        lookup,
        quote,
        summary: action.summary,
        tense: "done",
      }) ?? quote(action.summary),
  );
};

/** The actions an approval toast names before it counts the rest. */
const APPROVAL_NAMED = 2;

/**
The toast after Approve: the first two actions in words, each name quoted by `quote` (short, at
its slot), then how many more; "Done" when there is nothing to name. A toast's words are shown
whole, so the message itself is bounded here (fix round 1 of QA 18: ten actions ran to 25 lines).
*/
export const approvalText = (
  actions: readonly Action[],
  world: World,
  quote: (text: string) => string,
): string => {
  const { language } = world;
  const lines = doneLines(actions, world, quote);
  if (lines.length === 0) {
    return t(language, "assistant.approved");
  }
  const named = lines.slice(0, APPROVAL_NAMED);
  const rest = lines.length - named.length;
  const more =
    rest === 0
      ? []
      : [
          plural(language, rest, {
            few: t(language, "assistant.approvedMore.few"),
            many: t(language, "assistant.approvedMore.many"),
            one: t(language, "assistant.approvedMore.one"),
            other: t(language, "assistant.approvedMore.other"),
          }),
        ];
  return [...named, ...more].join("; ");
};
