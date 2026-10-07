import type { Clock } from "../clock.ts";
import type { AppStateHandle } from "../state.ts";

import { type ComposerActions, composerActions } from "./composer-actions.ts";
import { type ActionDeps, type ActionResult, fromStore } from "./deps.ts";
import { defaultEstimateHints, type EstimateBucket, type EstimateHints } from "./estimate-hints.ts";
import { type InboxActions, inboxActions } from "./inbox-actions.ts";
import { type InstanceActions, instanceActions } from "./instances.ts";
import { type PresetActions, presetActions } from "./preset-actions.ts";
import { type RankActions, rankActions } from "./rank-actions.ts";
import { type ReviewActions, reviewActions } from "./review-actions.ts";
import { type SettingsActions, settingsActions } from "./settings-actions.ts";
import { type TaskActions, taskActions } from "./task-actions.ts";
import { type WorkActions, workActions } from "./work-actions.ts";

export type ActionsOptions = {
  readonly state: AppStateHandle;
  readonly clock: Clock;
  readonly source: "app" | "web";
  /** Estimate buckets with samples; stage 3 fills them from the time ledger. */
  readonly hints?: EstimateHints | undefined;
};

export type Actions = ComposerActions &
  InboxActions &
  InstanceActions &
  PresetActions &
  RankActions &
  ReviewActions &
  SettingsActions &
  TaskActions &
  WorkActions & {
    readonly estimateHints: (presetId: string) => readonly EstimateBucket[];
    readonly revoke: (eventId: string) => ActionResult;
    /** Revokes the latest event this device recorded. */
    readonly undoLast: () => ActionResult;
  };

/**
Everything a screen can do, as one object: each method validates its input with the
core's rules against the live state, appends the events with this client's envelope
and answers with them (or a code), never throwing.
*/
export const createActions = (options: ActionsOptions): Actions => {
  const deps: ActionDeps = { clock: options.clock, source: options.source, state: options.state };
  const hints = options.hints ?? defaultEstimateHints;
  return {
    ...composerActions(deps),
    ...inboxActions(deps),
    ...instanceActions(deps),
    ...presetActions(deps),
    ...rankActions(deps),
    ...reviewActions(deps),
    ...settingsActions(deps),
    ...taskActions(deps),
    ...workActions(deps),
    estimateHints: (presetId) => hints.bucketsFor(presetId),
    revoke: async (eventId) => fromStore(await options.state.revoke(eventId)),
    undoLast: async () => fromStore(await options.state.undoLast()),
  };
};
