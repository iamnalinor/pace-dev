import type { EventBody } from "../input/bodies.ts";
import type { CoreState } from "../materialize/core-state.ts";
import type { Activity } from "../tracking/model.ts";
import type { ActivityPatch, ProposalBody, ProposalBodyOf } from "./schema.ts";

import { err, ok } from "../result.ts";
import { defaultsFor } from "../tracking/expect.ts";
import { runningActivity } from "../tracking/timeline.ts";
import { fitMinutes, PROPOSAL_LIMITS } from "./limits.ts";
import {
  type Bodies,
  isAfter,
  isBlank,
  type PlanContext,
  type Planned,
  stamped,
} from "./plan-context.ts";

export type ActivityProposal = Extract<ProposalBody, { readonly kind: `activity.${string}` }>;

/**
Begun earlier: from then, but never before the main activity running now (it takes over from
it, as the calendar's start does); a start ahead is now.
*/
const startedAt = (state: CoreState, startAt: string | undefined, now: string): string => {
  if (startAt === undefined || isAfter(startAt, now)) {
    return now;
  }
  const since = runningActivity(state.time, now)?.startAt;
  return since !== undefined && isAfter(since, startAt) ? since : startAt;
};

const startActivity = (
  state: CoreState,
  proposal: ProposalBodyOf<"activity.start">,
  ctx: PlanContext,
): Planned => {
  const label = proposal.label.trim();
  if (label === "") {
    return err("proposal/invalid");
  }
  // A length learned from long runs may pass a day: the event takes a day at most.
  const expectMinutes = fitMinutes(
    proposal.expectMinutes ??
      defaultsFor(state.time, { category: proposal.category, label }).expectMinutes,
    PROPOSAL_LIMITS.expectMinutes,
  );
  const body: EventBody = {
    payload: {
      activityId: ctx.newId(),
      category: proposal.category,
      label,
      ...(expectMinutes !== null && { expectMinutes }),
    },
    type: "activity.started",
  };
  return ok([stamped(ctx, body, startedAt(state, proposal.startAt, ctx.now))]);
};

/** A past block, stamped at its end; one that ends ahead of now is not tracked yet. */
const logActivity = (proposal: ProposalBodyOf<"activity.log">, ctx: PlanContext): Planned => {
  const label = proposal.label.trim();
  if (label === "" || !isAfter(proposal.end, proposal.start)) {
    return err("proposal/invalid");
  }
  if (isAfter(proposal.end, ctx.now)) {
    return err("retro/future");
  }
  const body: EventBody = {
    payload: {
      activityId: ctx.newId(),
      category: proposal.category,
      endAt: proposal.end,
      label,
      startAt: proposal.start,
    },
    type: "activity.logged",
  };
  return ok([stamped(ctx, body, proposal.end)]);
};

const isAhead = (at: string | undefined, now: string): boolean =>
  at !== undefined && isAfter(at, now);

/** The move of a block: both ends in the past, the end after the start. */
const adjustBodies = (activity: Activity, patch: ActivityPatch, now: string): Bodies => {
  const { end, start } = patch;
  if (isAhead(start, now) || isAhead(end, now)) {
    return err("retro/future");
  }
  const endAt = end ?? activity.endAt;
  if (endAt !== null && !isAfter(endAt, start ?? activity.startAt)) {
    return err("proposal/invalid");
  }
  const moved = {
    ...(start !== undefined && { startAt: start }),
    ...(end !== undefined && { endAt: end }),
  };
  return ok(
    Object.keys(moved).length === 0
      ? []
      : [{ payload: { activityId: activity.id, ...moved }, type: "activity.adjusted" }],
  );
};

const relabelBodies = (activity: Activity, patch: ActivityPatch): readonly EventBody[] => {
  const relabel = {
    ...(patch.label !== undefined && { label: patch.label.trim() }),
    ...(patch.category !== undefined && { category: patch.category }),
  };
  return Object.keys(relabel).length === 0
    ? []
    : [{ payload: { activityId: activity.id, ...relabel }, type: "activity.labelled" }];
};

const updateActivity = (activity: Activity, patch: ActivityPatch, ctx: PlanContext): Planned => {
  if (patch.label !== undefined && isBlank(patch.label)) {
    return err("proposal/invalid");
  }
  const adjusted = adjustBodies(activity, patch, ctx.now);
  if (!adjusted.ok) {
    return adjusted;
  }
  const bodies = [...adjusted.value, ...relabelBodies(activity, patch)];
  return bodies.length === 0
    ? err("proposal/empty-patch")
    : ok(bodies.map((body) => stamped(ctx, body)));
};

/**
A main activity a live start ended: nothing else ended it (a start writes no stop for the one
before), so revoking the start alone would bring it back running. A stop at the same instant
keeps it where it was (one that was stopped there already stays as it is).
*/
const endedBy = (state: CoreState, activity: Activity): Activity | undefined =>
  activity.isLogged || activity.isAlongside
    ? undefined
    : Object.values(state.time.activities).find(
        (other) =>
          !other.isLogged &&
          !other.isAlongside &&
          other.id !== activity.id &&
          other.endAt === activity.startAt,
      );

/** Takes a block off the ledger by revoking the event that made it. */
const deleteActivity = (state: CoreState, activity: Activity, ctx: PlanContext): Planned => {
  const before = endedBy(state, activity);
  return ok([
    ...(before === undefined
      ? []
      : [
          stamped(
            ctx,
            { payload: { activityId: before.id }, type: "activity.stopped" },
            activity.startAt,
          ),
        ]),
    stamped(ctx, { payload: { targetId: activity.originEventId }, type: "event.revoked" }),
  ]);
};

/** An activity proposal's events: a start now (or since), a past block, a move or a delete. */
export const planActivity = (
  state: CoreState,
  proposal: ActivityProposal,
  ctx: PlanContext,
): Planned => {
  if (proposal.kind === "activity.start") {
    return startActivity(state, proposal, ctx);
  }
  if (proposal.kind === "activity.log") {
    return logActivity(proposal, ctx);
  }
  const activity = state.time.activities[proposal.activityId];
  if (activity === undefined) {
    return err("proposal/unknown-activity");
  }
  return proposal.kind === "activity.delete"
    ? deleteActivity(state, activity, ctx)
    : updateActivity(activity, proposal.patch, ctx);
};
