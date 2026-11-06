import { err, ok, type Result } from "@pace/core";

import type { BaselineObservation, VerifiedBaseline } from "./types.ts";

import {
  callPort,
  type DeploymentError,
  type DeploymentPorts,
  type DeploymentRequest,
  type DeploymentSuccess,
  isHealthyProbe,
  type StageContext,
} from "./ports.ts";
import { parseControlPlaneSnapshot } from "./preflight.ts";
import { checkStagingSnapshot } from "./stage.ts";
import { readBaselineReadiness, verifyReadiness } from "./verification.ts";

const isSameFirebase = (
  actual: BaselineObservation["firebase"],
  expected: BaselineObservation["firebase"],
): boolean => {
  if (actual.verdict === "invalid") {
    return expected.verdict === "invalid" && actual.reason === expected.reason;
  }
  if (expected.verdict !== "ready" || actual.mode !== expected.mode) {
    return false;
  }
  return (
    actual.mode === "disabled" ||
    (expected.mode === "configured" && actual.projectId === expected.projectId)
  );
};

const isBaselineMatch = (input: unknown, expected: VerifiedBaseline): boolean => {
  const actual = readBaselineReadiness(input);
  if (!actual.ok) {
    return false;
  }
  const value = actual.value;
  return (
    value.versionId === expected.versionId &&
    value.attempt === expected.attempt &&
    value.policy === expected.policy &&
    isSameFirebase(value.firebase, expected.firebase)
  );
};

const isActiveVersionMatch = async (
  ports: DeploymentPorts,
  baseline: VerifiedBaseline,
  versionId: string,
): Promise<boolean> => {
  const snapshot = await callPort(async () => await ports.readSnapshot(baseline));
  if (!snapshot.ok) {
    return false;
  }
  const parsed = parseControlPlaneSnapshot(snapshot.value);
  if (!parsed.ok || parsed.value.status !== "existing") {
    return false;
  }
  const current = parsed.value;
  const [active] = current.active;
  return (
    current.accountId === baseline.accountId &&
    current.workerName === baseline.workerName &&
    current.active.length === 1 &&
    active?.versionId === versionId &&
    active.percentage === 100
  );
};

const isProductionMatch = async (
  ports: DeploymentPorts,
  context: StageContext,
  isRollback: boolean,
): Promise<boolean> => {
  const expectedVersion = isRollback ? context.baseline.versionId : context.candidate.versionId;
  if (!(await isActiveVersionMatch(ports, context.baseline, expectedVersion))) {
    return false;
  }
  const response = await callPort(
    async () => await ports.probe({ ...context.baseline, kind: "production" }),
  );
  if (!response.ok || !isHealthyProbe(response.value)) {
    return false;
  }
  if (isRollback) {
    return isBaselineMatch(response.value.readiness, context.baseline);
  }
  return verifyReadiness(response.value.readiness, context.expected).ok;
};

const rollback = async (
  ports: DeploymentPorts,
  context: StageContext,
  isUncertain: boolean,
): Promise<Result<never, DeploymentError>> => {
  const restored = await callPort(
    async () =>
      await ports.promote({
        target: context.baseline,
        versionId: context.baseline.versionId,
        percentage: 100,
      }),
  );
  if (!restored.ok || !(await isProductionMatch(ports, context, true))) {
    return err("rollback-failed");
  }
  return err(isUncertain ? "promotion-uncertain-rolled-back" : "production-failed-rolled-back");
};

const preparePromotion = async (
  request: DeploymentRequest,
  ports: DeploymentPorts,
  context: StageContext,
): Promise<Result<void, DeploymentError>> => {
  const stable = await checkStagingSnapshot(ports, context.baseline, context.candidate.versionId);
  if (!stable.ok) {
    return stable;
  }
  if (request.migrations.mode === "backward-compatible") {
    const migrated = await callPort(async () => await ports.migrate(context.baseline));
    if (!migrated.ok) {
      return migrated;
    }
  }
  return await checkStagingSnapshot(ports, context.baseline, context.candidate.versionId);
};

export const promoteCandidate = async (
  request: DeploymentRequest,
  ports: DeploymentPorts,
  context: StageContext,
): Promise<Result<DeploymentSuccess, DeploymentError>> => {
  const prepared = await preparePromotion(request, ports, context);
  if (!prepared.ok) {
    return prepared;
  }
  const promoted = await callPort(
    async () =>
      await ports.promote({
        target: context.baseline,
        versionId: context.candidate.versionId,
        percentage: 100,
      }),
  );
  if (!promoted.ok || !(await isProductionMatch(ports, context, false))) {
    return await rollback(ports, context, !promoted.ok);
  }
  return ok({
    versionId: context.candidate.versionId,
    baselineVersionId: context.baseline.versionId,
    attempt: context.expected.attempt,
  });
};
