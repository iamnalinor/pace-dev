import type { CoreState } from "../materialize/core-state.ts";
import type { PlanContext, Planned } from "./plan-context.ts";
import type { ProposalBody } from "./schema.ts";

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
