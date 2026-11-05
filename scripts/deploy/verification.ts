import { DeploymentReadinessSchema, err, ok, type Result } from "@pace/core";

import type {
  BaselineObservation,
  ExpectedPair,
  VerificationError,
  VerifiedReadiness,
} from "./types.ts";

const hasCanonicalIdentity = (input: unknown): boolean => {
  if (typeof input !== "object" || input === null || !("identity" in input)) {
    return false;
  }
  const identity = input.identity;
  return (
    typeof identity === "object" &&
    identity !== null &&
    "versionId" in identity &&
    "attempt" in identity &&
    [identity.versionId, identity.attempt].every(
      (value) => typeof value === "string" && value === value.trim(),
    )
  );
};

export const readBaselineReadiness = (
  input: unknown,
): Result<BaselineObservation, VerificationError> => {
  if (!hasCanonicalIdentity(input)) {
    return err("identity-unavailable");
  }
  const parsed = DeploymentReadinessSchema.safeParse(input);
  if (!parsed.success) {
    return err("invalid-readiness");
  }
  const { identity, policy, firebase } = parsed.data;
  if (identity.status !== "available") {
    return err("identity-unavailable");
  }
  if (policy === "invalid") {
    return err("invalid-policy");
  }
  return ok({ versionId: identity.versionId, attempt: identity.attempt, policy, firebase });
};

export const readReadyBaseline = (input: unknown): Result<VerifiedReadiness, VerificationError> => {
  const observation = readBaselineReadiness(input);
  if (!observation.ok) {
    return observation;
  }
  const { versionId, attempt, policy, firebase } = observation.value;
  if (firebase.verdict !== "ready") {
    return err("invalid-pair");
  }
  const pair: ExpectedPair =
    firebase.mode === "disabled"
      ? { mode: "disabled" }
      : { mode: "configured", projectId: firebase.projectId };
  return ok({ versionId, attempt, policy, pair });
};

export const verifyReadiness = (
  input: unknown,
  expected: VerifiedReadiness,
): Result<VerifiedReadiness, VerificationError> => {
  const actual = readReadyBaseline(input);
  if (!actual.ok) {
    return actual;
  }
  const value = actual.value;
  if (value.versionId !== expected.versionId || value.attempt !== expected.attempt) {
    return err("identity-mismatch");
  }
  if (value.policy !== expected.policy) {
    return err("policy-mismatch");
  }
  if (
    value.pair.mode !== expected.pair.mode ||
    (value.pair.mode === "configured" &&
      expected.pair.mode === "configured" &&
      value.pair.projectId !== expected.pair.projectId)
  ) {
    return err("pair-mismatch");
  }
  return actual;
};
