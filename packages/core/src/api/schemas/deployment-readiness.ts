import { z } from "zod";

import { FirebaseConfigReasonSchema } from "../../firebase/config.ts";

/** Identity comes from the runtime binding, never the human-facing application version. */
export const DeploymentIdentitySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("available"),
    versionId: z.string().trim().min(1),
    attempt: z.string().trim().min(1),
  }),
  z.object({ status: z.literal("unavailable") }),
]);

const FirebaseReadinessSchema = z.union([
  z.object({
    verdict: z.literal("ready"),
    mode: z.literal("configured"),
    projectId: z.string().min(1),
  }),
  z.object({ verdict: z.literal("ready"), mode: z.literal("disabled") }),
  z.object({ verdict: z.literal("invalid"), reason: FirebaseConfigReasonSchema }),
]);

/** A read-only operator verdict; invalid configuration does not make this a deployable version. */
export const DeploymentReadinessSchema = z.object({
  identity: DeploymentIdentitySchema,
  policy: z.enum(["additive", "strict", "invalid"]),
  firebase: FirebaseReadinessSchema,
});

export type DeploymentReadiness = z.output<typeof DeploymentReadinessSchema>;
