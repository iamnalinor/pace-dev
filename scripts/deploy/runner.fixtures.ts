import { type DeploymentReadiness, err, ok, type Result } from "@pace/core";

import type { DeploymentPorts, DeploymentRequest, PortError, ProbeTarget } from "./ports.ts";

const disabled: DeploymentReadiness["firebase"] = { verdict: "ready", mode: "disabled" };
export const configured: DeploymentReadiness["firebase"] = {
  verdict: "ready",
  mode: "configured",
  projectId: "project",
};
export const legacy: DeploymentReadiness["firebase"] = {
  verdict: "invalid",
  reason: "missing-android-config",
};
const readiness = (versionId: string, firebase: DeploymentReadiness["firebase"] = disabled) => ({
  identity: {
    status: "available",
    versionId,
    attempt: versionId === "baseline" ? "old" : "run-123",
  },
  policy: versionId === "baseline" ? "additive" : "strict",
  firebase,
});
export const request: DeploymentRequest = {
  mode: "staged",
  preflight: {
    accountId: "account",
    workerName: "worker",
    expectedSha: "a".repeat(40),
    checkout: { sha: "a".repeat(40), clean: true },
    attempt: "run-123",
    usedAttempts: ["old"],
    policy: "strict",
    intent: { mode: "keep" },
  },
  otherSecrets: {},
  migrations: { mode: "backward-compatible" },
};
export const androidConfig = JSON.stringify({
  project_info: { project_id: "project", project_number: "123" },
  client: [
    {
      api_key: [{ current_key: "SECRET_API" }],
      client_info: { mobilesdk_app_id: "app", android_client_info: { package_name: "test.app" } },
    },
  ],
});
export const serviceAccount = JSON.stringify({
  project_id: "project",
  client_email: "SECRET_EMAIL",
  private_key: "SECRET_KEY",
});
export const configure: DeploymentRequest = {
  ...request,
  preflight: { ...request.preflight, intent: { mode: "configure", androidConfig, serviceAccount } },
  otherSecrets: { OTHER: "SECRET_OTHER" },
};

type FakeOptions = {
  fail?: string;
  throwAt?: string;
  badCandidate?: string;
  anonymous?: number;
  baselineFirebase?: DeploymentReadiness["firebase"];
  candidateFirebase?: DeploymentReadiness["firebase"];
  productionBad?: boolean;
  rollbackBad?: boolean;
  driftAt?: number;
  baselineBad?: boolean;
  candidateBad?: boolean;
  invalidReadiness?: boolean;
  malformedUpload?: boolean;
  activeUpload?: boolean;
  absent?: boolean;
  activeDriftAt?: number;
  deploymentDriftAt?: number;
  rollbackIdentityBad?: boolean;
};
type FixtureState = {
  readonly calls: string[];
  readonly updates: Readonly<Record<string, null | string>>[];
  latest: string;
  active: string;
  reads: number;
  isPromoted: boolean;
};
type FixtureContext = {
  readonly options: FakeOptions;
  readonly state: FixtureState;
  readonly shouldFail: (name: string) => boolean;
};
type Fixture = Pick<FixtureState, "calls" | "updates"> & { readonly ports: DeploymentPorts };

const version = (options: FakeOptions, versionId: string) => ({
  versionId: options.badCandidate ?? versionId,
  previewUrl: `https://${versionId}.example.test`,
  inactive: true,
});

const isProbeHealthy = (context: FixtureContext, target: ProbeTarget): boolean => {
  const { options, state } = context;
  const isBrokenPromotion =
    state.isPromoted &&
    (state.active === "baseline" ? options.rollbackBad : options.productionBad) === true;
  const isBrokenBaseline =
    options.baselineBad === true && !state.isPromoted && target.kind === "production";
  const isBrokenCandidate = options.candidateBad === true && target.kind === "version";
  return !(isBrokenPromotion || isBrokenBaseline || isBrokenCandidate);
};

const probeResult = (context: FixtureContext, target: ProbeTarget) => {
  const { options, state } = context;
  const versionId = target.kind === "version" ? target.versionId : state.active;
  const firebase =
    versionId === "baseline"
      ? (options.baselineFirebase ?? disabled)
      : (options.candidateFirebase ?? disabled);
  const body =
    options.invalidReadiness === true && target.kind === "version"
      ? {}
      : readiness(versionId, firebase);
  const hasWrongRollbackIdentity =
    options.rollbackIdentityBad === true && state.isPromoted && state.active === "baseline";
  return {
    readiness: hasWrongRollbackIdentity ? readiness("other", firebase) : body,
    health: isProbeHealthy(context, target),
    instance: true,
  };
};

/** Model asynchronous ports without changing their result/error behavior. */
const asynchronously = async <T>(operation: () => T): Promise<T> => {
  await Promise.resolve();
  return operation();
};

const snapshot = (context: FixtureContext): Result<unknown, PortError> => {
  const { options, state, shouldFail } = context;
  state.reads += 1;
  if (shouldFail(`snapshot:${state.reads}`)) {
    return err("unauthorized");
  }
  if (options.absent === true) {
    return ok({ status: "absent", accountId: "account", workerName: "worker" });
  }
  const deploymentId = state.active === "baseline" ? "deployment" : "promoted";
  return ok({
    status: "existing",
    accountId: "account",
    workerName: "worker",
    active: [
      {
        versionId: state.reads === options.activeDriftAt ? "other" : state.active,
        percentage: 100,
      },
    ],
    latestVersionId: state.reads === options.driftAt ? "drift" : state.latest,
    deploymentId: state.reads === options.deploymentDriftAt ? "other-deployment" : deploymentId,
  });
};

const upload = (context: FixtureContext): Result<unknown, PortError> => {
  const { options, state, shouldFail } = context;
  if (shouldFail("upload")) {
    return err("command");
  }
  state.latest = "candidate";
  if (options.malformedUpload === true) {
    return ok({});
  }
  const candidate = version(options, "candidate");
  return ok(options.activeUpload === true ? { ...candidate, inactive: false } : candidate);
};

const fixturePorts = (context: FixtureContext): DeploymentPorts => {
  const { state, shouldFail, options } = context;
  return {
    readSnapshot: async () => await asynchronously(() => snapshot(context)),
    probe: async (target) =>
      await asynchronously(() => {
        const name = `probe:${target.kind}:${target.kind === "version" ? target.versionId : state.active}`;
        return shouldFail(name) ? err("transport") : ok(probeResult(context, target));
      }),
    anonymousStatus: async () =>
      await asynchronously(() =>
        shouldFail("anonymous") ? err("transport") : ok(options.anonymous ?? 403),
      ),
    upload: async () => await asynchronously(() => upload(context)),
    updateSecrets: async (input) =>
      await asynchronously(() => {
        state.updates.push(input.values);
        if (shouldFail("secrets")) {
          return err("command");
        }
        state.latest = "updated";
        return ok(version(options, "updated"));
      }),
    migrate: async () =>
      await asynchronously(() => (shouldFail("migrate") ? err("command") : ok(undefined))),
    promote: async (input) =>
      await asynchronously(() => {
        if (shouldFail(`promote:${input.versionId}`)) {
          return err("command");
        }
        state.active = input.versionId;
        state.isPromoted = true;
        return ok(undefined);
      }),
  };
};

export const fake = (options: FakeOptions = {}): Fixture => {
  const state: FixtureState = {
    calls: [],
    updates: [],
    latest: "baseline",
    active: "baseline",
    reads: 0,
    isPromoted: false,
  };
  const shouldFail = (name: string): boolean => {
    state.calls.push(name);
    if (options.throwAt === name) {
      throw new Error("SECRET_PORT_MESSAGE");
    }
    return options.fail === name;
  };
  return {
    calls: state.calls,
    updates: state.updates,
    ports: fixturePorts({ state, options, shouldFail }),
  };
};
