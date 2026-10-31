import { z } from "zod";

import type { ActionBody } from "./schema.ts";

import { knownOrNull, knownValues } from "../api/tolerant.ts";
import { type ParseField, ParseFieldSchema } from "../parse/schema.ts";
import { ACTION_KINDS } from "./kinds.ts";
import { changedFields } from "./summary.ts";

/*
What the assistant log keeps of each proposed action, so the log can later say in the reader's
language what was done with a message ("Created task “Buy cable”", "Started “Gym”"), match it to
what the person approved, and open the task. The decision row stores it in its JSON `inputs`;
rows written before it existed have only the summaries, read by the same function.
*/

const CLOSE_OUTCOMES = ["done", "cancelled", "skipped"] as const;

/** A list of whatever an older or newer row holds: unknown entries dropped, a non-list empty. */
const anyList = <T extends z.ZodType>(element: T) => {
  const known = knownValues(element);
  return z
    .unknown()
    .optional()
    .transform((value): z.output<T>[] => {
      const parsed = known.safeParse(value);
      return parsed.success ? parsed.data : [];
    });
};

export const DecisionStepSchema = z.object({
  kind: z.enum(ACTION_KINDS),
  /** The task title or activity label the action itself carries (a create, a start, a log). */
  subject: knownOrNull(z.string()),
  /** The existing task an edit, close, delete or subtask change is about. */
  taskId: knownOrNull(z.string()),
  /** The existing activity an edit or delete is about. */
  activityId: knownOrNull(z.string()),
  /** What an edit changes. */
  fields: anyList(ParseFieldSchema),
  closeOutcome: knownOrNull(z.enum(CLOSE_OUTCOMES)),
  /** When a started or logged activity begins; `null` for a start that means "now". */
  startAt: knownOrNull(z.string()),
});

export type DecisionStep = z.output<typeof DecisionStepSchema>;

const NONE = {
  activityId: null,
  closeOutcome: null,
  fields: [],
  startAt: null,
  subject: null,
  taskId: null,
} as const satisfies Omit<DecisionStep, "kind">;

const taskStep = (body: Extract<ActionBody, { kind: `task.${string}` }>): DecisionStep => {
  switch (body.kind) {
    case "task.create": {
      return { ...NONE, kind: body.kind, subject: body.task.title };
    }
    case "task.update": {
      const fields = [...new Set(changedFields(body))];
      return { ...NONE, fields, kind: body.kind, taskId: body.taskId };
    }
    case "task.close": {
      return { ...NONE, closeOutcome: body.outcome, kind: body.kind, taskId: body.taskId };
    }
    case "task.delete":
    case "task.addSubtasks":
    case "task.markSubtasks": {
      return { ...NONE, kind: body.kind, taskId: body.taskId };
    }
  }
};

const activityStep = (body: Extract<ActionBody, { kind: `activity.${string}` }>): DecisionStep => {
  switch (body.kind) {
    case "activity.start": {
      return { ...NONE, kind: body.kind, startAt: body.startAt ?? null, subject: body.label };
    }
    case "activity.log": {
      return { ...NONE, kind: body.kind, startAt: body.start, subject: body.label };
    }
    case "activity.update": {
      const fields = [...new Set(changedFields(body))];
      return { ...NONE, activityId: body.activityId, fields, kind: body.kind };
    }
    case "activity.delete": {
      return { ...NONE, activityId: body.activityId, kind: body.kind };
    }
  }
};

/** One proposed action as the decision log keeps it. */
export const decisionStepOf = (body: ActionBody): DecisionStep =>
  body.kind.startsWith("task.")
    ? taskStep(body as Extract<ActionBody, { kind: `task.${string}` }>)
    : activityStep(body as Extract<ActionBody, { kind: `activity.${string}` }>);

/** What a parse decision's `inputs` holds, read from whatever a row of any age stored. */
export type DecisionInputs = {
  /** The message the person typed, verbatim. */
  readonly text: null | string;
  /** The model that read it, or "rules"; absent in rows written before it was kept. */
  readonly provider: null | string;
  readonly steps: readonly DecisionStep[];
  /** The one-line summaries of the proposed actions, in the language of the time. */
  readonly summaries: readonly string[];
  /** The fields the model only guessed: not found in the text. */
  readonly doubtful: readonly ParseField[];
};

const DecisionInputsSchema = z.object({
  text: knownOrNull(z.string()),
  provider: knownOrNull(z.string()),
  steps: anyList(DecisionStepSchema),
  actions: anyList(z.string()),
  doubtful: anyList(ParseFieldSchema),
});

const EMPTY: DecisionInputs = {
  doubtful: [],
  provider: null,
  steps: [],
  summaries: [],
  text: null,
};

/** A decision's `inputs` as the log reads them; anything unreadable reads as empty. */
export const readDecisionInputs = (inputs: unknown): DecisionInputs => {
  const parsed = DecisionInputsSchema.safeParse(inputs);
  if (!parsed.success) {
    return EMPTY;
  }
  const { actions, doubtful, provider, steps, text } = parsed.data;
  return { doubtful, provider, steps, summaries: actions, text };
};
