import type { z } from "zod";

import type { ProjectColorName } from "../design/tokens.ts";
import type { ImportanceSchema } from "../events/payloads.ts";

export type Importance = z.output<typeof ImportanceSchema>;

/** How urgency grows: see `docs/presets.md` and the urgency module. */
export type UrgencyPolicy = "age" | "lag" | "pace" | "resubmission";

/** What happens when the deadline passes. */
export type DeadlinePolicy =
  | { readonly kind: "hard" }
  | {
      readonly kind: "resubmission";
      /** Days after the deadline during which late work is still the soft target. */
      readonly softDays: number;
      /** Final hard deadline (UTC instant) and the zone it was set in; `null` = none. */
      readonly finalAt: null | string;
      readonly finalTz: null | string;
    };

export type Submission = "per_subtask" | "whole";

export type ProgressMode = "none" | "slider" | "subtasks";

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type WeekSlot = {
  readonly weekday: Weekday;
  /** Wall-clock `HH:MM` in the recurrence zone. */
  readonly time: string;
};

/**
A weekly homework schedule. The due slot falls in the same ISO week as the issued slot
when it is later in that week, otherwise in the following week (`dueWeekOffset`).
*/
export type Recurrence = {
  readonly issued: WeekSlot;
  readonly due: WeekSlot;
  /** IANA zone the slots are read in. */
  readonly tz: string;
};

/** Which optional task fields the form shows. */
export type PresetFields = {
  readonly link: boolean;
  readonly description: boolean;
  readonly startAt: boolean;
  readonly submitVia: boolean;
};

export type NotifyParams = {
  /** "Critical": less than this many hours to the deadline … */
  readonly criticalHours: number;
  /** … with progress below this share (0–1). */
  readonly criticalProgress: number;
  /** Or the score first crosses this value. */
  readonly criticalScore: number;
  /** A task waiting longer than this is "stuck". */
  readonly waitingDays: number;
  /** An in-progress task untouched longer than this is "stuck". */
  readonly inProgressIdleDays: number;
};

/** What a preset stores: only the keys it changes relative to its parent. */
export type PresetDefinition = {
  readonly urgencyPolicy?: UrgencyPolicy;
  readonly defaultImportance?: Importance;
  readonly deadlinePolicy?: DeadlinePolicy;
  readonly submission?: Submission;
  readonly progressMode?: ProgressMode;
  /** `null` removes an inherited recurrence. */
  readonly recurrence?: null | Recurrence;
  readonly fields?: Partial<PresetFields>;
  readonly notify?: Partial<NotifyParams>;
  readonly defaultEstimateMinutes?: number;
  readonly color?: ProjectColorName;
};

/** A definition with every value filled in: the base preset, its chain and the task's overrides. */
export type ResolvedPreset = {
  readonly urgencyPolicy: UrgencyPolicy;
  readonly defaultImportance: Importance;
  readonly deadlinePolicy: DeadlinePolicy;
  readonly submission: Submission;
  readonly progressMode: ProgressMode;
  readonly recurrence: null | Recurrence;
  readonly fields: PresetFields;
  readonly notify: NotifyParams;
  readonly defaultEstimateMinutes: number;
  readonly color: ProjectColorName;
};

export type Preset = {
  readonly id: string;
  readonly name: string;
  /** Parent preset id; `null` only for the default (base) presets. */
  readonly extends: null | string;
  /** A default preset: shipped with the app, editable and archivable, never re-created. */
  readonly builtIn: boolean;
  readonly archived: boolean;
  readonly definition: PresetDefinition;
  readonly createdAt: string;
  /** Position in pickers, ascending; ties by name. */
  readonly order: number;
};
