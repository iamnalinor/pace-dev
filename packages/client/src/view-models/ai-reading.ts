import type { ParseField, ParseQuestion, ParseResponse, Proposal } from "@pace/core";

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
  readonly proposals: readonly Proposal[];
};

const editsOf = (proposal: Extract<Proposal, { kind: "task.create" }>): ComposerEdits => {
  const { task } = proposal;
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
  const create = response.proposals.find(
    (proposal): proposal is Extract<Proposal, { kind: "task.create" }> =>
      proposal.kind === "task.create",
  );
  return {
    doubtful: create?.doubtful ?? [],
    edits: create === undefined ? {} : editsOf(create),
    proposals: response.proposals,
    provider: response.provider,
    questions: response.questions ?? [],
  };
};
