import { z } from "zod";

import { err, type Result } from "@pace/core";

import type { VerifiedBaseline } from "./types.ts";

import {
  callPort,
  type DeploymentError,
  type DeploymentPorts,
  type DeploymentRequest,
  type DeploymentSuccess,
  deploymentTarget,
  isHealthyProbe,
} from "./ports.ts";
import { parseControlPlaneSnapshot, preflight } from "./preflight.ts";
import { promoteCandidate } from "./promote.ts";
import { stageCandidate } from "./stage.ts";

const secretName = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const secretValue = z.union([z.string(), z.null()]);
const requestSchema = z.object({
  mode: z.literal("staged"),
  preflight: z.looseObject({ policy: z.literal("strict") }),
  migrations: z.strictObject({ mode: z.enum(["none", "backward-compatible"]) }),
  otherSecrets: z.record(secretName, secretValue),
});
const forbiddenSecrets = new Set([
  "FIREBASE_ANDROID_CONFIG",
  "FIREBASE_SERVICE_ACCOUNT",
  "PACE_DEPLOY_ATTEMPT",
  "PACE_FIREBASE_CONFIG_POLICY",
  "CF_VERSION_METADATA",
]);
const isValidRequest = (request: DeploymentRequest): boolean => {
  const parsed = requestSchema.safeParse(request);
  return (
    parsed.success &&
    Object.keys(parsed.data.otherSecrets).every((name) => !forbiddenSecrets.has(name))
  );
};

const observeBaseline = async (
  request: DeploymentRequest,
  ports: DeploymentPorts,
): Promise<Result<VerifiedBaseline, DeploymentError>> => {
  const snapshot = await callPort(
    async () => await ports.readSnapshot(deploymentTarget(request.preflight)),
  );
  if (!snapshot.ok) {
    return snapshot;
  }
  const parsed = parseControlPlaneSnapshot(snapshot.value);
  if (!parsed.ok) {
    return parsed;
  }
  const probe = await callPort(
    async () => await ports.probe({ ...deploymentTarget(request.preflight), kind: "production" }),
  );
  if (!probe.ok) {
    return probe;
  }
  if (!isHealthyProbe(probe.value)) {
    return err("baseline-probe-failed");
  }
  return preflight(request.preflight, parsed.value, probe.value.readiness);
};

export const runDeployment = async (
  request: DeploymentRequest,
  ports: DeploymentPorts,
): Promise<Result<DeploymentSuccess, DeploymentError>> => {
  if (!isValidRequest(request)) {
    return err("invalid-stage-request");
  }
  const baseline = await observeBaseline(request, ports);
  if (!baseline.ok) {
    return baseline;
  }
  const staged = await stageCandidate(request, ports, baseline.value);
  return staged.ok ? await promoteCandidate(request, ports, staged.value) : staged;
};
