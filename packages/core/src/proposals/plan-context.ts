import type { Event, EventInput } from "../events/event-schema.ts";
import type { EventBody } from "../input/bodies.ts";
import type { Result } from "../result.ts";
import type { RetroError } from "../validation/retro-rules.ts";

export type ProposalError =
  | "proposal/empty-patch"
  | "proposal/invalid"
  | "proposal/subtask-done"
  | "proposal/unknown-activity"
  | "proposal/unknown-subtask"
  | "proposal/unknown-task"
  | RetroError;

/** Who writes, when, and where new ids come from. */
export type PlanContext = {
  readonly now: string;
  readonly deviceTz: string;
  readonly source: Event["source"];
  readonly newId: () => string;
  /** The message the proposal was read from: kept as the source of a task it adds to. */
  readonly sourceText?: string | undefined;
};

export type Planned = Result<readonly EventInput[], ProposalError>;

export type Bodies = Result<readonly EventBody[], ProposalError>;

/** A body stamped as an event of the context's source at `at` (now by default). */
export const stamped = (ctx: PlanContext, body: EventBody, at: string = ctx.now): EventInput => ({
  ...body,
  occurredAt: at,
  precision: "exact",
  source: ctx.source,
});

export const isBlank = (text: string): boolean => text.trim() === "";

/** Whether `at` is later than `than`. */
export const isAfter = (at: string, than: string): boolean => Date.parse(at) > Date.parse(than);
