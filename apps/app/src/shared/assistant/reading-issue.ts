import type { MessageKey } from "@pace/core";

import { type Assistant, unreadOf } from "@pace/client";

type Answer = Awaited<ReturnType<Assistant["propose"]>>;

/** Why an answer shows no card: the sentence, and the time it names when the assistant is back. */
export type ReadingIssue = {
  readonly key: MessageKey;
  /** For `assistant.unread.limited`: when the assistant takes requests again. */
  readonly retryAt: null | string;
  /** No model read it for now: "Read it when it's back" would be kept (limited, unreachable). */
  readonly canReadLater: boolean;
};

/** Why no model read a text the rules found nothing in, in the words for its reason (class 99). */
const unreadKey = (
  answer: Extract<NonNullable<Answer>, { status: "unavailable" }>,
): ReadingIssue => {
  const { canReadLater, reason } = unreadOf(answer);
  switch (reason) {
    case "limited": {
      return answer.retryAt === null
        ? { canReadLater, key: "assistant.unread.limitedSoon", retryAt: null }
        : { canReadLater, key: "assistant.unread.limited", retryAt: answer.retryAt };
    }
    case "unreachable": {
      return { canReadLater, key: "assistant.unread.unreachable", retryAt: null };
    }
    case "unreadable": {
      return { canReadLater, key: "assistant.unread.unreadable", retryAt: null };
    }
    case "off": {
      return { canReadLater, key: "assistant.unread.off", retryAt: null };
    }
  }
};

/**
Why an answer shows no card. A revision that came to nothing keeps the card before it; no model
read it and the rules found nothing says why no model did, by the answer's `reason`, as the
composer's form does (QA round 21 M3: "Try again" for "off" and "out of requests" could not help);
a reading that found nothing for this field says so and where such text goes (trying again cannot
help); anything else (no answer at all) asks to try again.
*/
export const readingIssue = (
  answer: Answer,
  { domain, isRevision }: { readonly domain: "activity" | "task"; readonly isRevision: boolean },
): ReadingIssue => {
  if (isRevision) {
    return { canReadLater: false, key: "assistant.couldNotRevise", retryAt: null };
  }
  if (answer?.status === "unavailable" && answer.actions.length === 0) {
    return unreadKey(answer);
  }
  if (answer?.status !== "parsed" || answer.actions.length > 0) {
    return { canReadLater: false, key: "assistant.couldNotRead", retryAt: null };
  }
  return {
    canReadLater: false,
    key: domain === "activity" ? "assistant.nothingToStart" : "assistant.nothingToDo",
    retryAt: null,
  };
};
