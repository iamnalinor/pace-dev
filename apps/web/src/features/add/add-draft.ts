import type { CreateTaskForm } from "@pace/client";

import { wallClockToIso } from "#web/shared/time/wall-clock.ts";
import { err, type Importance, type MessageKey, ok, type Result } from "@pace/core";

/** Everything the Add form holds while the person types. */
export type AddDraft = {
  /** "Paste or type anything": the title until the parse of stage 2 reads it. */
  readonly text: string;
  readonly presetId: string;
  /** The recurring instance the problems go to; `null` makes a new task. */
  readonly instanceId: null | string;
  readonly projectName: string;
  /** `datetime-local` value on the due zone's wall clock; empty = no due. */
  readonly due: string;
  /** The zone picked for the due; `null` = the account zone. */
  readonly dueTz: null | string;
  readonly importance: "default" | Importance;
  readonly estimate: null | number;
  readonly problems: readonly string[];
  readonly description: string;
  readonly ticket: string;
  readonly submitVia: string;
};

export const EMPTY_DRAFT: AddDraft = {
  description: "",
  due: "",
  dueTz: null,
  estimate: null,
  importance: "default",
  instanceId: null,
  presetId: "personal",
  problems: [],
  projectName: "",
  submitVia: "",
  text: "",
  ticket: "",
};

/** `1, 3, 5а, 6` → four problems; each label stays exactly as typed between the commas. */
export const splitProblems = (input: string): readonly string[] =>
  input
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

/** An optional text field: absent when blank. */
const filled = (value: string): string | undefined =>
  value.trim() === "" ? undefined : value.trim();

/**
The draft as `createTask` input. The title is sent as typed; a due is read on `zone`'s
wall clock and always travels with that zone, so it can never be ambiguous.
*/
export const draftToForm = (draft: AddDraft, zone: string): Result<CreateTaskForm, MessageKey> => {
  if (draft.text.trim() === "") {
    return err("add.titleRequired");
  }
  const dueAt = draft.due === "" ? undefined : wallClockToIso(draft.due, zone);
  if (dueAt === null) {
    return err("add.dueInvalid");
  }
  const description = filled(draft.description);
  const projectName = filled(draft.projectName);
  const ticket = filled(draft.ticket);
  const submitVia = filled(draft.submitVia);
  return ok({
    title: draft.text,
    presetId: draft.presetId,
    ...(projectName !== undefined && { projectName }),
    ...(dueAt !== undefined && { dueAt, dueTz: zone }),
    ...(draft.importance !== "default" && { importance: draft.importance }),
    ...(draft.estimate !== null && { estimateMinutes: draft.estimate }),
    subtasks: draft.problems.map((label) => ({ label })),
    ...(description !== undefined && { description }),
    fields: {
      ...(ticket !== undefined && { ticket }),
      ...(submitVia !== undefined && { submitVia }),
    },
  });
};
