import { z } from "zod";

import { err, ok, type Result, validateFirebaseConfig } from "@pace/core";

import type {
  AuthenticatedSnapshot,
  BaselineObservation,
  ExpectedPair,
  PreflightError,
  PreflightRequest,
  VerifiedBaseline,
} from "./types.ts";

import { readBaselineReadiness } from "./verification.ts";

const nonblank = z
  .string()
  .min(1)
  .refine((value) => value === value.trim());
const activeVersionSchema = z.strictObject({
  versionId: nonblank,
  percentage: z.number().min(0).max(100),
});
const snapshotSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("absent"), accountId: nonblank, workerName: nonblank }),
  z.strictObject({
    status: z.literal("existing"),
    accountId: nonblank,
    workerName: nonblank,
    active: z.array(activeVersionSchema),
    latestVersionId: nonblank,
    deploymentId: nonblank,
  }),
]);
/** Authentication/transport errors must be handled by the adapter before this parser. */
export const parseControlPlaneSnapshot = (
  input: unknown,
): Result<AuthenticatedSnapshot, "invalid-control-plane"> => {
  const parsed = snapshotSchema.safeParse(input);
  return parsed.success ? ok(parsed.data) : err("invalid-control-plane");
};
const keepIntentSchema = z.strictObject({ mode: z.literal("keep") });
const disableIntentSchema = z.strictObject({ mode: z.literal("disable") });
const configureIntentSchema = z.strictObject({
  mode: z.literal("configure"),
  androidConfig: z.string(),
  serviceAccount: z.string(),
});
const intentSchema = z.discriminatedUnion("mode", [
  keepIntentSchema,
  disableIntentSchema,
  configureIntentSchema,
]);
const requestSchema = z.object({
  accountId: nonblank,
  workerName: nonblank,
  expectedSha: z.string().regex(/^[a-f0-9]{40}$/),
  checkout: z.object({ sha: z.string(), clean: z.literal(true) }),
  attempt: z.string().regex(/^[A-Z0-9][\w.-]{0,127}$/i),
  usedAttempts: z.array(z.string()),
  policy: z.enum(["additive", "strict"]),
  intent: intentSchema,
});

type ExistingSnapshot = Extract<AuthenticatedSnapshot, { status: "existing" }>;

const validateActiveVersion = (
  current: ExistingSnapshot,
): Result<ExistingSnapshot, PreflightError> => {
  const [active] = current.active;
  if (active === undefined || current.active.length !== 1 || active.percentage !== 100) {
    return err("unsafe-active-deployment");
  }
  return current.latestVersionId === active.versionId ? ok(current) : err("latest-version-drift");
};

const validateTarget = (
  request: PreflightRequest,
  snapshot: AuthenticatedSnapshot,
): Result<ExistingSnapshot, PreflightError> => {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success || request.checkout.sha !== request.expectedSha) {
    return err("invalid-request");
  }
  const remote = parseControlPlaneSnapshot(snapshot);
  if (!remote.ok) {
    return remote;
  }
  const current = remote.value;
  if (current.accountId !== request.accountId || current.workerName !== request.workerName) {
    return err("target-mismatch");
  }
  if (current.status === "absent") {
    return err("worker-absent");
  }
  return validateActiveVersion(current);
};

const inheritedPair = (baseline: BaselineObservation): Result<ExpectedPair, PreflightError> => {
  const firebase = baseline.firebase;
  if (firebase.verdict !== "ready") {
    return err("invalid-pair");
  }
  return ok(
    firebase.mode === "disabled"
      ? { mode: "disabled" }
      : { mode: "configured", projectId: firebase.projectId },
  );
};

const resolvePair = (
  intent: PreflightRequest["intent"],
  baseline: BaselineObservation,
): Result<ExpectedPair, PreflightError> => {
  if (baseline.firebase.verdict === "invalid" && baseline.policy === "strict") {
    return err("invalid-pair");
  }
  if (intent.mode === "keep") {
    return inheritedPair(baseline);
  }
  if (intent.mode === "disable") {
    return ok({ mode: "disabled" });
  }
  const config = validateFirebaseConfig({
    FIREBASE_ANDROID_CONFIG: intent.androidConfig,
    FIREBASE_SERVICE_ACCOUNT: intent.serviceAccount,
  });
  return !config.ok || config.value === null
    ? err("invalid-configure-pair")
    : ok({ mode: "configured", projectId: config.value.projectId });
};

export const preflight = (
  request: PreflightRequest,
  snapshot: AuthenticatedSnapshot,
  baselineReadiness: unknown,
): Result<VerifiedBaseline, PreflightError> => {
  const remote = validateTarget(request, snapshot);
  if (!remote.ok) {
    return remote;
  }
  const current = remote.value;
  const baseline = readBaselineReadiness(baselineReadiness);
  if (!baseline.ok) {
    return baseline;
  }
  if (baseline.value.versionId !== current.latestVersionId) {
    return err("identity-mismatch");
  }
  if (
    request.usedAttempts.includes(request.attempt) ||
    request.attempt === baseline.value.attempt
  ) {
    return err("attempt-reused");
  }
  const pair = resolvePair(request.intent, baseline.value);
  if (!pair.ok) {
    return pair;
  }
  return ok({
    ...baseline.value,
    accountId: current.accountId,
    workerName: current.workerName,
    deploymentId: current.deploymentId,
    expectedPair: pair.value,
    candidateAttempt: request.attempt,
    candidatePolicy: request.policy,
  });
};
