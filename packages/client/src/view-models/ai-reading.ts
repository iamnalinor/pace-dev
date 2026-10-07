import {
  type CoreState,
  type ParseField,
  type ParseQuestion,
  type ParseResponse,
  parseToQuickInput,
  type QueryContext,
} from "@pace/core";

import type { ComposerEdits } from "./composer.ts";

type Parsed = Extract<ParseResponse, { status: "parsed" }>;

/** The assistant's reading of the line, as chip edits plus what to double-check. */
export type AiReading = {
  readonly edits: ComposerEdits;
  /** Fields the assistant gave without a quote from the text: shown marked. */
  readonly doubtful: readonly ParseField[];
  readonly questions: readonly ParseQuestion[];
  readonly provider: string;
};

/**
Turns `POST /api/parse`'s answer into composer edits: everything it found fills a chip, a
field it left empty keeps the rules' reading (never cleared). The text stays as typed.
*/
export const aiReading = (
  text: string,
  response: Parsed,
  world: { readonly state: CoreState; readonly ctx: QueryContext },
): AiReading => {
  const { ctx, state } = world;
  const input = parseToQuickInput(
    { doubtful: response.doubtful, isClean: response.isClean, result: response.result },
    text,
    { ctx, state },
  );
  const due =
    input.dueAt === null || input.dueTz === null ? undefined : { at: input.dueAt, tz: input.dueTz };
  return {
    doubtful: response.doubtful,
    edits: {
      due,
      estimateMinutes: input.estimateMinutes ?? undefined,
      importance: input.isImportanceExplicit ? input.importance : undefined,
      presetId: input.presetId,
      projectId: input.projectId ?? undefined,
      projectName: input.projectId === null ? (input.projectName ?? undefined) : undefined,
      subtasks: input.subtasks,
      title: input.title,
    },
    provider: response.provider,
    questions: response.result.questions,
  };
};
