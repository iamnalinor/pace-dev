import type { EventInput } from "../events/event-schema.ts";
import type { PlanContext, Planned, ProposalError } from "./plan-context.ts";
import type { ProposalBody } from "./schema.ts";

import { coreReducer, type CoreState } from "../materialize/core-state.ts";
import { err, ok, type Result } from "../result.ts";
import { domainOf } from "./kinds.ts";
import { planActivity } from "./plan-activity.ts";
import { planTask, type TaskProposal } from "./plan-task.ts";

export type { PlanContext, ProposalError } from "./plan-context.ts";

const isTaskProposal = (proposal: ProposalBody): proposal is TaskProposal =>
  domainOf(proposal.kind) === "task";

/**
The events a proposal writes once the person accepts it, stamped now by `ctx.source` (a past
block at its end, a start at its beginning). Tasks go through the retro rules like any write;
an id the state does not know is refused, as is a patch that changes nothing.
*/
export const planProposal = (
  state: CoreState,
  proposal: ProposalBody,
  ctx: PlanContext,
): Planned =>
  isTaskProposal(proposal) ? planTask(state, proposal, ctx) : planActivity(state, proposal, ctx);

/** The first proposal of a batch that could not be planned, and why. */
export type BatchError = { readonly index: number; readonly error: ProposalError };

/** The state with planned events folded in, so the next proposal sees what they write. */
const afterInputs = (
  state: CoreState,
  inputs: readonly EventInput[],
  ctx: PlanContext,
): CoreState => {
  const [first, ...rest] = inputs;
  if (first === undefined) {
    return state;
  }
  const event = { ...first, deviceId: "plan", id: ctx.newId(), recordedAt: ctx.now };
  return afterInputs(coreReducer(state, event), rest, ctx);
};

const planFrom = (
  state: CoreState,
  proposals: readonly ProposalBody[],
  { ctx, index }: { readonly ctx: PlanContext; readonly index: number },
): Result<readonly EventInput[], BatchError> => {
  const [first, ...rest] = proposals;
  if (first === undefined) {
    return ok([]);
  }
  const planned = planProposal(state, first, ctx);
  if (!planned.ok) {
    return err({ error: planned.error, index });
  }
  const after = planFrom(afterInputs(state, planned.value, ctx), rest, { ctx, index: index + 1 });
  return after.ok ? ok([...planned.value, ...after.value]) : after;
};

/**
Every proposal of an answer, planned in order over what the ones before write (two new tasks
naming the same new project make it once); the first that cannot be planned refuses the batch.
The state is folded with the reducer, which does not apply revocations: a later proposal still
sees what an earlier one deletes (harmless, the materializer drops writes to a revoked task).
*/
export const planProposals = (
  state: CoreState,
  proposals: readonly ProposalBody[],
  ctx: PlanContext,
): Result<readonly EventInput[], BatchError> => planFrom(state, proposals, { ctx, index: 0 });
