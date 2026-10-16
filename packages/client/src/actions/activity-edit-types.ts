import type { ActivityCategory } from "@pace/core";

/** What the Day sheet edits: an existing block or a new past one. */
export type ActivityTarget =
  | {
      readonly kind: "edit";
      readonly activityId: string;
      readonly label: string;
      readonly category: ActivityCategory;
      readonly expectMinutes?: null | number;
      readonly taskId?: null | string;
      readonly startAt: string;
      /** `null` while it runs: only the start can move. */
      readonly endAt: null | string;
    }
  | { readonly kind: "log"; readonly startAt: string; readonly endAt: string };

/** The sheet's fields once read: the end is `null` for a block still running. */
export type ActivityEntry = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly expectMinutes?: null | number;
  readonly taskId?: null | string;
  readonly startAt: string;
  readonly endAt: null | string;
};
