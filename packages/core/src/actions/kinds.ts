import { z } from "zod";

/**
What the assistant may propose for one message. Each kind is planned into events by
`planAction`; nothing is written until the person accepts it.
*/
export const ACTION_KINDS = [
  "task.create",
  "task.update",
  "task.delete",
  "task.close",
  "task.addSubtasks",
  "task.markSubtasks",
  "activity.start",
  "activity.log",
  "activity.update",
  "activity.delete",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

/** Which input a message was typed into: the task field or the activity field. */
export const PARSE_DOMAINS = ["task", "activity"] as const;

export const ParseDomainSchema = z.enum(PARSE_DOMAINS);

export type ParseDomain = z.output<typeof ParseDomainSchema>;

/** At or above this the bot takes the assistant's task-or-activity reading; below it, it asks. */
export const CLASSIFY_CONFIDENT = 0.8;

/** The domain a kind belongs to: `task.*` or `activity.*`. */
export const domainOf = (kind: ActionKind): ParseDomain =>
  kind.startsWith("task.") ? "task" : "activity";
