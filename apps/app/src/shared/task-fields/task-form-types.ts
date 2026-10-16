import type { ComposerOption } from "@pace/client";
import type { DeadlinePolicy, Importance, SeriesSchedule } from "@pace/core";

import type { Zoned } from "./date-field.tsx";

/** Plain values shared by the composer and task editor. */
export type TaskFormValues = {
  readonly title: string;
  readonly presetId: string;
  readonly projectId: null | string;
  readonly newProjectName: null | string;
  readonly importance: Importance;
  readonly start: Zoned;
  readonly due: Zoned;
  readonly estimateMinutes: null | number;
  readonly deadlinePolicy: DeadlinePolicy;
  readonly recurrence: null | SeriesSchedule;
  readonly description: string;
  readonly link: string;
};

export type TaskFormOptions = {
  readonly presets: readonly ComposerOption[];
  readonly projects: readonly ComposerOption[];
  /** Each category's own estimate, shown when the task has none of its own. */
  readonly estimates: Readonly<Record<string, number>>;
};
