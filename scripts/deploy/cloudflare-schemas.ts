import { z } from "zod";

export const canonicalText = z
  .string()
  .min(1)
  .refine((value) => value === value.trim());
export const accountSchema = z.object({ id: canonicalText });
const subdomainSchema = z.object({
  previews_enabled: z.boolean().optional(),
  preview_url_suffix: z.string().optional(),
});
export const workerSchema = z.object({
  id: canonicalText,
  name: canonicalText,
  subdomain: subdomainSchema.optional(),
});
const trafficSchema = z.object({ version_id: z.uuid(), percentage: z.number().min(0).max(100) });
const deploymentSchema = z.object({
  id: z.uuid(),
  strategy: z.literal("percentage"),
  versions: z.array(trafficSchema).min(1),
});
export const deploymentsSchema = z.object({ deployments: z.array(deploymentSchema).min(1) });
const versionItemSchema = z.object({ id: z.uuid(), number: z.number().int().positive() });
export const versionsSchema = z.object({ items: z.array(versionItemSchema).min(1) });
const exportSchema = z.object({ type: canonicalText });
const scriptRuntimeSchema = z.object({ exports: z.record(z.string(), exportSchema).optional() });
const resourcesSchema = z.object({ script_runtime: scriptRuntimeSchema.optional() });
export const versionSchema = z.object({
  id: z.uuid(),
  metadata: z.object({ hasPreview: z.boolean().optional() }),
  resources: resourcesSchema,
});
const noErrors = z.array(z.unknown()).length(0);
export const successSchema = z.object({
  success: z.literal(true),
  errors: noErrors,
  result: z.unknown(),
});
const missingWorkerError = z.object({ code: z.literal(10_007) });
export const missingWorkerSchema = z.object({
  success: z.literal(false),
  errors: z.array(missingWorkerError).min(1),
  result: z.null().optional(),
});
