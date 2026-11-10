import {
  DeploymentIdentitySchema,
  type DeploymentReadiness,
  FirebaseConfigPolicySchema,
  validateFirebaseConfig,
} from "@pace/core";

type DeploymentBindings = Parameters<typeof validateFirebaseConfig>[0] & {
  readonly PACE_FIREBASE_CONFIG_POLICY?: string;
  readonly CF_VERSION_METADATA?: undefined | { readonly id?: unknown };
  readonly PACE_DEPLOY_ATTEMPT?: string | undefined;
};

/** Only explicitly selected non-secret fields cross this diagnostic boundary. */
export const deploymentReadinessOf = (env: DeploymentBindings): DeploymentReadiness => {
  const identity = DeploymentIdentitySchema.safeParse({
    status: "available",
    versionId: env.CF_VERSION_METADATA?.id,
    attempt: env.PACE_DEPLOY_ATTEMPT,
  });
  const policy = FirebaseConfigPolicySchema.optional().safeParse(env.PACE_FIREBASE_CONFIG_POLICY);
  const configuration = validateFirebaseConfig(env);
  return {
    identity: identity.success ? identity.data : { status: "unavailable" },
    policy: policy.success ? (policy.data ?? "additive") : "invalid",
    firebase: firebaseVerdict(configuration, policy.success),
  };
};

const firebaseVerdict = (
  result: ReturnType<typeof validateFirebaseConfig>,
  isPolicyValid: boolean,
): DeploymentReadiness["firebase"] => {
  if (!isPolicyValid) {
    return { verdict: "invalid", reason: "invalid-config-policy" };
  }
  if (!result.ok) {
    return { verdict: "invalid", reason: result.error };
  }
  return result.value === null
    ? { verdict: "ready", mode: "disabled" }
    : { verdict: "ready", mode: "configured", projectId: result.value.projectId };
};
