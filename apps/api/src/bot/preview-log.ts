import { type DecisionResolution, newId, resolutionsOf } from "@pace/core";

import type { DecisionEntry } from "../shared/contract.ts";
import type { Turn } from "./turn.ts";

/*
The bot's side of the assistant log: each reading is logged under an id the preview keeps, and
a button (Approve, To Inbox, Cancel) tells the log what became of the thread's readings.
*/

/** Logs a reading under an id of its own, which the preview keeps for its buttons. */
export const logReading = async (turn: Turn, entry: DecisionEntry): Promise<string> => {
  const id = newId();
  await turn.store.logDecisions([{ ...entry, id }], turn.now);
  return id;
};

/** Tells the decision log what the person did with the preview's readings. */
export const tellLog = async (
  turn: Turn,
  pending: { readonly decisionIds?: readonly string[] },
  {
    resolution,
    taskId = null,
  }: { readonly resolution: DecisionResolution; readonly taskId?: null | string },
): Promise<void> => {
  const answers = resolutionsOf(pending.decisionIds ?? [], resolution, taskId);
  if (answers.length > 0) {
    await turn.store.resolveDecisions(answers);
  }
};
