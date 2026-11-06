import type { DeploymentReadiness } from "@pace/core";

export type DeploymentPolicy = "additive" | "strict";
export type ExpectedPair =
  | { readonly mode: "configured"; readonly projectId: string }
  | { readonly mode: "disabled" };
/** Only adapter-authenticated responses may enter this type or its parser. */
export type AuthenticatedSnapshot =
  | { readonly status: "absent"; readonly accountId: string; readonly workerName: string }
  | {
      readonly status: "existing";
      readonly accountId: string;
      readonly workerName: string;
      readonly active: readonly { readonly versionId: string; readonly percentage: number }[];
      readonly latestVersionId: string;
      readonly deploymentId: string;
    };
export type PreflightRequest = {
  readonly accountId: string;
  readonly workerName: string;
  readonly expectedSha: string;
  readonly checkout: { readonly sha: string; readonly clean: boolean };
  readonly attempt: string;
  readonly usedAttempts: readonly string[];
  readonly policy: DeploymentPolicy;
  readonly intent:
    | {
        readonly mode: "configure";
        readonly androidConfig: string;
        readonly serviceAccount: string;
      }
    | { readonly mode: "disable" }
    | { readonly mode: "keep" };
};
export type VerifiedReadiness = {
  readonly versionId: string;
  readonly attempt: string;
  readonly policy: DeploymentPolicy;
  readonly pair: ExpectedPair;
};
export type BaselineObservation = {
  readonly versionId: string;
  readonly attempt: string;
  readonly policy: DeploymentPolicy;
  readonly firebase: DeploymentReadiness["firebase"];
};
export type VerifiedBaseline = BaselineObservation & {
  readonly accountId: string;
  readonly workerName: string;
  readonly deploymentId: string;
  readonly expectedPair: ExpectedPair;
  readonly candidateAttempt: string;
  readonly candidatePolicy: DeploymentPolicy;
};
export type VerificationError =
  | "identity-mismatch"
  | "identity-unavailable"
  | "invalid-pair"
  | "invalid-policy"
  | "invalid-readiness"
  | "pair-mismatch"
  | "policy-mismatch";
export type PreflightError =
  | "attempt-reused"
  | "invalid-configure-pair"
  | "invalid-control-plane"
  | "invalid-request"
  | "latest-version-drift"
  | "target-mismatch"
  | "unsafe-active-deployment"
  | "worker-absent"
  | VerificationError;
