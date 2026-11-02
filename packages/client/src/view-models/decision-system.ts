import {
  type Decision,
  formatInZone,
  type Language,
  type MessageKey,
  readSleepDecision,
  t,
} from "@pace/core";

/**
A row automatic sleep wrote, in words: "Sleep started at 23:40 (no phone use since)", the time in
the zone it was decided in. `null` for one this client cannot read (a newer server's rule), whose
own explanation is shown instead; never the rule's key (class 42).
*/
const sleepLine = (decision: Decision, language: Language): null | string => {
  const read = readSleepDecision(decision.rule, decision.inputs);
  return read === null
    ? null
    : t(language, `decisions.sleep.${read.kind}`, {
        time: formatInZone(read.at, read.zone, "HH:mm"),
      });
};

const NOTIFICATIONS: Readonly<Record<string, MessageKey>> = {
  sent: "decisions.notificationSent",
  suppressed: "decisions.notificationHeld",
};

/**
A row the server's own rules wrote (automatic sleep, an older notification decision), in words,
with the server's explanation as a small note where the words say less. A kind or outcome this
client does not know shows the explanation itself.
*/
export const systemRow = (
  decision: Decision,
  language: Language,
): { readonly lines: readonly string[]; readonly note: null | string } => {
  const sleep = decision.kind === "sleep" ? sleepLine(decision, language) : null;
  if (sleep !== null) {
    return { lines: [sleep], note: null };
  }
  const notification =
    decision.kind === "notification" && Object.hasOwn(NOTIFICATIONS, decision.outcome)
      ? NOTIFICATIONS[decision.outcome]
      : undefined;
  return notification === undefined
    ? { lines: [decision.explanation], note: null }
    : { lines: [t(language, notification)], note: decision.explanation };
};
