import { z } from "zod";

/** One local notification the phone schedules (mirrors `notifyPlan` in core). */
export const PlannedNotificationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("digest"), at: z.iso.datetime() }),
  z.strictObject({
    kind: z.literal("deadline"),
    at: z.iso.datetime(),
    taskId: z.string(),
    title: z.string(),
  }),
]);

export const NotifyPlanOutputSchema = z.object({
  items: z.array(PlannedNotificationSchema),
});

export const DecisionsQuerySchema = z.object({
  taskId: z.string().min(1).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** One automatic decision with what it was based on, newest first. */
export const DecisionSchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  kind: z.string(),
  taskId: z.string().nullable(),
  rule: z.string(),
  inputs: z.unknown(),
  outcome: z.string(),
  explanation: z.string(),
});

export const DecisionsOutputSchema = z.object({
  decisions: z.array(DecisionSchema),
});
