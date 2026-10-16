import type { Action, ParseField, ParseQuestion, ParseResponse } from "@pace/core";

import type { ComposerEdits } from "./composer.ts";

type Parsed = Extract<ParseResponse, { status: "parsed" }>;

/** The assistant's reading of the line, as chip edits plus what to double-check. */
export type AiReading = {
  readonly edits: ComposerEdits;
  /** Fields the assistant gave without a quote from the text: shown marked. */
  readonly doubtful: readonly ParseField[];
  readonly questions: readonly ParseQuestion[];
  readonly provider: string;
  /** Everything it proposed, edits and deletes of existing tasks included. */
  readonly actions: readonly Action[];
};

const editsOf = (action: Extract<Action, { kind: "task.create" }>): ComposerEdits => {
  const { task } = action;
  return {
    description: task.description ?? undefined,
    due:
      task.dueAt === null || task.dueTz === null ? undefined : { at: task.dueAt, tz: task.dueTz },
    estimateMinutes: task.estimateMinutes ?? undefined,
    importance: task.importance ?? undefined,
    presetId: task.presetId,
    projectId: task.projectId ?? undefined,
    projectName: task.projectId === null ? (task.projectName ?? undefined) : undefined,
    subtasks: task.subtasks,
    title: task.title,
  };
};

/**
Turns `POST /api/parse`'s answer into composer edits: the new task it proposes fills the chips
(the server already let the rules fill what the model left empty). Without a new task the
chips keep the rules' reading. The text stays as typed.
*/
export const aiReading = (response: Parsed): AiReading => {
  const create = response.actions.find(
    (action): action is Extract<Action, { kind: "task.create" }> => action.kind === "task.create",
  );
  return {
    doubtful: create?.doubtful ?? [],
    edits: create === undefined ? {} : editsOf(create),
    actions: response.actions,
    provider: response.provider,
    questions: response.questions ?? [],
  };
};
