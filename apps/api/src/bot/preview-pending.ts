import type { Action, ParseQuestion, ParseRequestBody } from "@pace/core";

/**
A preview waiting for its button: the text and, when it was understood, its actions. They are
planned again on Accept, so the events are stamped then and checked against the state then.
*/
export type Pending = {
  /** The latest message: the request, or the correction this preview answers. */
  readonly text: string;
  /**
  The request itself, the first message of the thread: what To Inbox keeps and what the
  written task cites. Absent in previews remembered before it was added: then `text`.
  */
  readonly request?: string;
  readonly actions: null | readonly Action[];
  readonly domain: "activity" | "task";
  readonly thread: NonNullable<ParseRequestBody["thread"]>;
  readonly awaitingChoice: boolean;
  /** The assistant's questions, which option buttons point at by index. Absent in older ones. */
  readonly questions?: readonly ParseQuestion[];
  /**
  The decision-log rows of the thread's readings, the last for this preview: a button tells the
  log what became of them. Absent in previews remembered before it was kept.
  */
  readonly decisionIds?: readonly string[];
};

/** The request a preview is about, also for one remembered before `request` was kept. */
export const requestOf = (pending: Pending): string => pending.request ?? pending.text;

/** A remembered preview that was understood, so a correction can revise it. */
export const isRevisable = (
  pending: Partial<Pending> | undefined,
): pending is Partial<Pending> &
  Pick<Pending, "domain" | "text"> & { readonly actions: readonly Action[] } =>
  pending?.text !== undefined &&
  pending.domain !== undefined &&
  pending.actions !== undefined &&
  pending.actions !== null;
