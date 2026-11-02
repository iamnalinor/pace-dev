import type { DecisionStep, EventInput } from "@pace/core";

import type { DecisionEntry } from "../shared/contract.ts";

/** What the decision log keeps of a queued text. */
type Queued = {
  readonly channel: "api" | "bot";
  readonly enqueuedAt: string;
  readonly text: string;
};

/** The tasks a text read later wrote, as the decision log keeps its steps. */
const createdSteps = (written: readonly EventInput[]): readonly DecisionStep[] =>
  written
    .filter(
      (input): input is Extract<EventInput, { readonly type: "task.created" }> =>
        input.type === "task.created",
    )
    .map((input) => ({
      activityId: null,
      closeOutcome: null,
      fields: [],
      kind: "task.create",
      renamedTo: null,
      startAt: null,
      subject: input.payload.title,
      taskId: input.payload.taskId,
    }));

/** What became of a text read later: what it created (a row that opens the task), or the Inbox. */
export const decisionOf = (
  item: Queued,
  { isDone, written }: { readonly isDone: boolean; readonly written: readonly EventInput[] },
): DecisionEntry => {
  const steps = isDone ? createdSteps(written) : [];
  return {
    explanation: isDone
      ? "Read later, as asked when the assistant was out of requests."
      : "Could not be read later; kept in the Inbox.",
    inputs: { channel: item.channel, enqueuedAt: item.enqueuedAt, steps, text: item.text },
    kind: "parse",
    outcome: isDone ? "applied" : "inbox",
    rule: "parse.deferred",
    taskId: steps[0]?.taskId ?? null,
  };
};
