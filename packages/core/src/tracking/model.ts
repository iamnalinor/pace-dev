import type { z } from "zod";

import type { ProjectColorName } from "../design/tokens.ts";
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
  readonly limitMinutes: null | number;
  /** Recorded afterwards: it wins over the live activities it overlaps. */
  readonly isLogged: boolean;
  /** Messaging was part of it: the phone's messenger time does not count against it. */
  readonly messengersOnPurpose: boolean;
};

/** A button of the time bar and the defaults an activity started from it gets. */
export type ActivityButton = {
  readonly id: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color: ProjectColorName;
  readonly taskId: null | string;
  readonly expectMinutes: null | number;
  readonly limitMinutes: null | number;
  readonly order: number;
  /** A tap opens the details sheet (what exactly, which task) instead of starting blind. */
  readonly shouldAskDetails: boolean;
};

export type TimeState = {
  readonly activities: Readonly<Record<string, Activity>>;
  readonly buttons: Readonly<Record<string, ActivityButton>>;
  /** False until the first button event: the default buttons stand in until then. */
  readonly hasCustomButtons: boolean;
};

export const INITIAL_TIME_STATE: TimeState = {
  activities: {},
  buttons: {},
  hasCustomButtons: false,
};
