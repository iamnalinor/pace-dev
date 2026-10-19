import type { CoreState } from "../materialize/core-state.ts";
import type { ModelAction } from "../parse/schema.ts";
import type { VerifiedAction } from "../parse/verify.ts";
import type { ActivityCategory } from "../tracking/model.ts";
import type { ActionBody, ActivityPatch } from "./schema.ts";

import { ACTIVITY_CATEGORIES } from "../events/payloads.ts";
import { err, ok, type Result } from "../result.ts";
import { typedActivity } from "../tracking/typed.ts";
import { isGiven } from "./from-model-task.ts";
import { categoryOfLabel } from "./rules.ts";

type Converted = Result<ActionBody, "action/incomplete">;

const isActivityCategory = (value: null | string): value is ActivityCategory =>
  value !== null && (ACTIVITY_CATEGORIES as readonly string[]).includes(value);

type Read = {
  readonly verified: VerifiedAction;
  readonly label: string;
  readonly category: ActivityCategory;
};

const patchOf = ({ action, end, start }: VerifiedAction): ActivityPatch => ({
  ...(start !== null && { start }),
  ...(end !== null && { end }),
  ...(isGiven(action.label) && { label: action.label.trim() }),
  ...(isActivityCategory(action.category) && { category: action.category }),
});

type ActivityKind = Extract<ModelAction["kind"], `activity.${string}`>;

/** Each activity action from the action the model gave. */
const READERS: Readonly<Record<ActivityKind, (read: Read) => Converted>> = {
  "activity.delete": ({ verified }) =>
    ok({ activityId: verified.activity?.id ?? "", kind: "activity.delete" }),
  "activity.log": ({ category, label, verified: { end, start } }) =>
    start === null || end === null
      ? err("action/incomplete")
      : ok({ category, end, kind: "activity.log", label, start }),
  "activity.start": ({ category, label, verified }) =>
    ok({
      category,
      expectMinutes: verified.action.expectMinutes,
      kind: "activity.start",
      label,
      ...(verified.start !== null && { startAt: verified.start }),
    }),
  "activity.update": ({ verified }) => {
    const patch = patchOf(verified);
    return Object.keys(patch).length === 0
      ? err("action/incomplete")
      : ok({ activityId: verified.activity?.id ?? "", kind: "activity.update", patch });
  },
};

/**
An activity action: the label the model gave (else the typed words), the category it gave
(else the rules' reading of the label: a meal, or what it was before), the times it read on
the account's clock. "Other" is the model naming no category, so the rules may say more.
*/
export const activityOf = (
  verified: VerifiedAction,
  world: { readonly state: CoreState; readonly text: string },
): Converted => {
  const { action } = verified;
  const label = isGiven(action.label) ? action.label.trim() : typedActivity(world.text).label;
  const category =
    isActivityCategory(action.category) && action.category !== "other"
      ? action.category
      : categoryOfLabel(world.state.time, label);
  return READERS[action.kind as ActivityKind]({ category, label, verified });
};
