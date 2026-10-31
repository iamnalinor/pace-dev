import { endpoint } from "./endpoint.ts";
import {
  DecisionResolvedSchema,
  DecisionResolveSchema,
  DecisionsOutputSchema,
  DecisionsQuerySchema,
} from "./schemas/notify.ts";

/** The assistant's log and what the person did with each reading (part of `endpoints`). */
export const decisionEndpoints = {
  /** The decision log (assistant readings, older notification decisions, and why), newest first. */
  list: endpoint({
    auth: true,
    method: "GET",
    output: DecisionsOutputSchema,
    path: "/api/decisions",
    query: DecisionsQuerySchema,
  }),
  /** What the person did with assistant readings: approved, dismissed, to Inbox, corrected. */
  resolve: endpoint({
    auth: true,
    body: DecisionResolveSchema,
    method: "POST",
    output: DecisionResolvedSchema,
    path: "/api/decisions/resolve",
  }),
};
