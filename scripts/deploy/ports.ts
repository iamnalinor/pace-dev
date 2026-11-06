import { err, type Result } from "@pace/core";

import type {
  PreflightError,
  PreflightRequest,
  VerifiedBaseline,
  VerifiedReadiness,
} from "./types.ts";

export type Target = { readonly accountId: string; readonly workerName: string };
export type ProbeTarget = Target &
  (
    | { readonly kind: "production" }
    | { readonly kind: "version"; readonly versionId: string; readonly previewUrl: string }
  );
export type Probe = {
  readonly readiness: unknown;
  readonly health: boolean;
  readonly instance: boolean;
};
export type PortError =
  | "command"
  | "malformed"
  | "transport"
  | "unauthorized"
  | "unsupported-version-preview";
export type PortResult<T> = Promise<Result<T, PortError>>;
export type Candidate = {
  readonly versionId: string;
  readonly previewUrl: string;
  readonly inactive: true;
};
export type DeploymentRequest = {
  readonly mode: "staged";
  readonly preflight: PreflightRequest;
  readonly otherSecrets: Readonly<Record<string, null | string>>;
  readonly migrations: { readonly mode: "backward-compatible" | "none" };
};
/**
Adapters authenticate all control-plane reads and allowlist exact Worker version URL domains
before attaching probe credentials. Staging/promotion calls must run under one external lock.
Each secret bulk update must preserve the supplied attempt and the uploaded policy bindings.
*/
export type DeploymentPorts = {
  readonly readSnapshot: (target: Target) => PortResult<unknown>;
  readonly probe: (target: ProbeTarget) => PortResult<Probe>;
  readonly anonymousStatus: (
    target: ProbeTarget & { readonly kind: "version" },
  ) => PortResult<number>;
  readonly upload: (input: {
    readonly target: Target;
    readonly attempt: string;
    readonly policy: "strict";
  }) => PortResult<unknown>;
  readonly updateSecrets: (input: {
    readonly target: Target;
    readonly baseVersionId: string;
    readonly attempt: string;
    readonly values: Readonly<Record<string, null | string>>;
  }) => PortResult<unknown>;
  readonly migrate: (target: Target) => PortResult<void>;
  readonly promote: (input: {
    readonly target: Target;
    readonly versionId: string;
    readonly percentage: 100;
  }) => PortResult<void>;
};
export type DeploymentError =
  | "baseline-probe-failed"
  | "candidate-probe-failed"
  | "deployment-drift"
  | "invalid-candidate"
  | "invalid-stage-request"
  | "port-failed"
  | "preview-unprotected"
  | "production-failed-rolled-back"
  | "promotion-uncertain-rolled-back"
  | "rollback-failed"
  | PreflightError;
export type StageContext = {
  readonly baseline: VerifiedBaseline;
  readonly candidate: Candidate;
  readonly expected: VerifiedReadiness;
};
export type DeploymentSuccess = {
  readonly versionId: string;
  readonly baselineVersionId: string;
  readonly attempt: string;
};

/** Even an adapter that unexpectedly throws cannot expose its exception or secret values. */
export const callPort = async <T>(
  operation: () => PortResult<T>,
): Promise<Result<T, "port-failed">> => {
  try {
    const result = await operation();
    return result.ok ? result : err("port-failed");
  } catch {
    return err("port-failed");
  }
};

export const isHealthyProbe = (input: unknown): input is Probe => {
  return (
    typeof input === "object" &&
    input !== null &&
    "readiness" in input &&
    "health" in input &&
    input.health === true &&
    "instance" in input &&
    input.instance === true
  );
};

export const deploymentTarget = (target: Target): Target => ({
  accountId: target.accountId,
  workerName: target.workerName,
});
