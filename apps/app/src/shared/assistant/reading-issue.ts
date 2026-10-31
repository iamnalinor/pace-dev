import type { Assistant } from "@pace/client";
import type { MessageKey } from "@pace/core";

type Answer = Awaited<ReturnType<Assistant["propose"]>>;

/**
Why an answer shows no card. A revision that came to nothing keeps the card before it; a reading
that found nothing for this field says so and where such text goes (trying again cannot help);
anything else (no answer at all) asks to try again.
*/
export const readingIssue = (
  answer: Answer,
  { domain, isRevision }: { readonly domain: "activity" | "task"; readonly isRevision: boolean },
): MessageKey => {
  if (isRevision) {
    return "assistant.couldNotRevise";
  }
  if (answer?.status !== "parsed" || answer.actions.length > 0) {
    return "assistant.couldNotRead";
  }
  return domain === "activity" ? "assistant.nothingToStart" : "assistant.nothingToDo";
};
