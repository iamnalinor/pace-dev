import { z } from "zod";

import { defineTool } from "../registry.ts";
import { success } from "../tool-kit.ts";

const DecisionSchema = z.object({
  at: z.string(),
  explanation: z.string(),
  id: z.string(),
  inputs: z.unknown().describe("What the rule saw: thresholds, scores, the digest content…"),
  kind: z.string().describe("notification | parse"),
  outcome: z.string().describe("sent | suppressed | parsed | unavailable"),
  rule: z.string().describe("For example critical, digest, stuck, limit, parse."),
  taskId: z.string().nullable(),
});

/** Why the system did (or did not) do something on its own: the decision log. */
export const searchDecisions = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: true },
  description:
    'Searches the decision log: every automatic decision Pace made (notifications sent or held back, LLM parses) with the rule, its inputs and a one-line explanation, newest first. Filter by task id, time range (ISO instants) or free text over rule, outcome, explanation and inputs. Use it to answer "why did (not) I get a reminder?".',
  handler: async (args, ctx) => {
    const decisions = await ctx.store.decisions({ ...args, limit: args.limit ?? 20 });
    return success(
      { decisions: [...decisions] },
      decisions.length === 0
        ? "No decisions match."
        : decisions
            .map((entry) => `- ${entry.at} ${entry.rule} → ${entry.outcome}: ${entry.explanation}`)
            .join("\n"),
    );
  },
  input: {
    from: z.iso.datetime().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    q: z.string().trim().min(1).max(200).optional(),
    taskId: z.string().optional(),
    to: z.iso.datetime().optional(),
  },
  name: "search_decisions",
  output: { decisions: z.array(DecisionSchema) },
  scope: "tasks:read",
  title: "Search decisions",
});
