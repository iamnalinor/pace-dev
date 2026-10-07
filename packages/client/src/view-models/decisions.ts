import type { MessageKey } from "@pace/core";

const LABELS: Readonly<Record<string, MessageKey>> = {
  "kind.notification": "decisions.kind.notification",
  "kind.parse": "decisions.kind.parse",
  "outcome.parsed": "decisions.outcome.parsed",
  "outcome.sent": "decisions.outcome.sent",
  "outcome.suppressed": "decisions.outcome.suppressed",
  "outcome.unavailable": "decisions.outcome.unavailable",
};

/** The catalog key of a decision's kind or outcome; `null` for one newer than this client. */
export const decisionLabelKey = (group: "kind" | "outcome", value: string): MessageKey | null =>
  LABELS[`${group}.${value}`] ?? null;
