import type { z } from "zod";

import type { ActivityCategorySchema } from "../events/payloads.ts";

export type ActivityCategory = z.output<typeof ActivityCategorySchema>;

/** One stretch of time: started live (and stopped by the next start) or logged afterwards. */
export type Activity = {
  readonly id: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly taskId: null | string;
  readonly buttonId: null | string;
  readonly startAt: string;
  /** `null` while it runs. */
  readonly endAt: null | string;
  readonly expectMinutes: null | number;
  /** Recorded afterwards: it wins over the live activities it overlaps. */
  readonly isLogged: boolean;
  /** Runs next to the main activity (music over work): neither stops the other. */
  readonly isAlongside: boolean;
};

export type TimeState = {
  readonly activities: Readonly<Record<string, Activity>>;
};

export const INITIAL_TIME_STATE: TimeState = { activities: {} };
