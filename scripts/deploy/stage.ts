import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

import type { AuthenticatedSnapshot, VerifiedBaseline } from "./types.ts";

import {
  callPort,
  type Candidate,
  type DeploymentError,
  type DeploymentPorts,
  type DeploymentRequest,
  isHealthyProbe,
  type ProbeTarget,
  type StageContext,
} from "./ports.ts";
import { parseControlPlaneSnapshot } from "./preflight.ts";
import { verifyReadiness } from "./verification.ts";

const candidateSchema = z.strictObject({
  versionId: z
    .string()
    .min(1)
    .refine((value) => value === value.trim()),
  previewUrl: z.url().refine((value) => new URL(value).protocol === "https:"),
  inactive: z.literal(true),
});
const parseCandidate = (
  input: unknown,
  forbidden: readonly string[],
): Result<Candidate, DeploymentError> => {
  const parsed = candidateSchema.safeParse(input);
  return !parsed.success || forbidden.includes(parsed.data.versionId)
    ? err("invalid-candidate")
    : ok(parsed.data);
};

const isStagingSnapshotMatch = (
  current: Extract<AuthenticatedSnapshot, { readonly status: "existing" }>,
  expected: { readonly baseline: VerifiedBaseline; readonly latestVersionId: string },
): boolean => {
  const { baseline, latestVersionId } = expected;
  const [active] = current.active;
  return (
    current.accountId === baseline.accountId &&
    current.workerName === baseline.workerName &&
    current.deploymentId === baseline.deploymentId &&
    current.latestVersionId === latestVersionId &&
    current.active.length === 1 &&
    active?.versionId === baseline.versionId &&
    active.percentage === 100
  );
};

export const checkStagingSnapshot = async (
  ports: DeploymentPorts,
  baseline: VerifiedBaseline,
  latestVersionId: string,
): Promise<Result<void, DeploymentError>> => {
  const response = await callPort(async () => await ports.readSnapshot(baseline));
  if (!response.ok) {
    return response;
  }
  const parsed = parseControlPlaneSnapshot(response.value);
  if (!parsed.ok) {
    return parsed;
  }
  const current = parsed.value;
  if (current.status !== "existing") {
    return err("deployment-drift");
  }
  return isStagingSnapshotMatch(current, { baseline, latestVersionId })
    ? ok(undefined)
    : err("deployment-drift");
};

const stagedSecrets = (
  request: DeploymentRequest,
  baseline: VerifiedBaseline,
): Readonly<Record<string, null | string>> => {
  const intent = request.preflight.intent;
  if (intent.mode === "configure") {
    return {
      ...request.otherSecrets,
      FIREBASE_ANDROID_CONFIG: intent.androidConfig,
      FIREBASE_SERVICE_ACCOUNT: intent.serviceAccount,
    };
  }
  const isAbsent = baseline.firebase.verdict === "ready" && baseline.firebase.mode === "disabled";
  if (!isAbsent && intent.mode === "disable") {
    return {
      ...request.otherSecrets,
      FIREBASE_ANDROID_CONFIG: null,
      FIREBASE_SERVICE_ACCOUNT: null,
    };
  }
  return request.otherSecrets;
};

const updateCandidate = async (
  request: DeploymentRequest,
  ports: DeploymentPorts,
  selection: { readonly baseline: VerifiedBaseline; readonly candidate: Candidate },
): Promise<Result<Candidate, DeploymentError>> => {
  const { baseline, candidate } = selection;
  const unchanged = await checkStagingSnapshot(ports, baseline, candidate.versionId);
  if (!unchanged.ok) {
    return unchanged;
  }
  const values = stagedSecrets(request, baseline);
  if (Object.keys(values).length === 0) {
    return ok(candidate);
  }
  const updated = await callPort(
    async () =>
      await ports.updateSecrets({
        target: baseline,
        baseVersionId: candidate.versionId,
        attempt: baseline.candidateAttempt,
        values,
      }),
  );
  if (!updated.ok) {
    return updated;
  }
  const next = parseCandidate(updated.value, [baseline.versionId, candidate.versionId]);
  if (!next.ok) {
    return next;
  }
  const stable = await checkStagingSnapshot(ports, baseline, next.value.versionId);
  return stable.ok ? next : stable;
};

const verifyCandidate = async (
  ports: DeploymentPorts,
  context: StageContext,
): Promise<Result<StageContext, DeploymentError>> => {
  const target: ProbeTarget & { kind: "version" } = {
    ...context.baseline,
    ...context.candidate,
    kind: "version",
  };
  const anonymous = await callPort(async () => await ports.anonymousStatus(target));
  if (!anonymous.ok) {
    return anonymous;
  }
  if (anonymous.value !== 401 && anonymous.value !== 403) {
    return err("preview-unprotected");
  }
  const probe = await callPort(async () => await ports.probe(target));
  if (!probe.ok) {
    return probe;
  }
  if (!isHealthyProbe(probe.value)) {
    return err("candidate-probe-failed");
  }
  const verified = verifyReadiness(probe.value.readiness, context.expected);
  return verified.ok ? ok(context) : verified;
};

export const stageCandidate = async (
  request: DeploymentRequest,
  ports: DeploymentPorts,
  baseline: VerifiedBaseline,
): Promise<Result<StageContext, DeploymentError>> => {
  const upload = await callPort(
    async () =>
      await ports.upload({
        target: baseline,
        attempt: baseline.candidateAttempt,
        policy: "strict",
      }),
  );
  if (!upload.ok) {
    return upload;
  }
  const candidate = parseCandidate(upload.value, [baseline.versionId]);
  if (!candidate.ok) {
    return candidate;
  }
  const final = await updateCandidate(request, ports, { baseline, candidate: candidate.value });
  if (!final.ok) {
    return final;
  }
  const expected = {
    versionId: final.value.versionId,
    attempt: baseline.candidateAttempt,
    policy: baseline.candidatePolicy,
    pair: baseline.expectedPair,
  };
  return await verifyCandidate(ports, { baseline, candidate: final.value, expected });
};
