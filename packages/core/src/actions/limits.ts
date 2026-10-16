/**
The bounds of a action, read by its schema and by the code that makes one: what the server
answers must always fit the contract the client parses it with.
*/
export const ACTION_LIMITS = {
  /** An expected length of an activity: a day. */
  expectMinutes: 1440,
  /** An estimate of a task: a week. */
  estimateMinutes: 10_080,
  link: 2000,
  projectName: 100,
  subtaskLabel: 200,
  subtasks: 100,
  summary: 500,
  title: 300,
} as const;

/** Whole positive minutes up to `max`; anything else is no length at all. */
export const fitMinutes = (minutes: null | number | undefined, max: number): null | number =>
  minutes === null || minutes === undefined || minutes < 1
    ? null
    : Math.min(max, Math.round(minutes));

/** Text cut to `max` characters, the cut marked with "…". */
export const fitText = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
