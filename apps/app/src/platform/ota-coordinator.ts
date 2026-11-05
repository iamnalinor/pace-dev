import { createStore, type StoreApi } from "zustand/vanilla";

export type OtaDiagnostics = {
  readonly apkVersion: null | string;
  readonly runtimeVersion: null | string;
  readonly updateId: null | string;
  readonly createdAt: null | string;
  readonly isEmbeddedLaunch: boolean;
  readonly isEmergencyLaunch: boolean;
  readonly emergencyLaunchReason: null | string;
};
export type OtaReady = { readonly kind: "rollback" | "update"; readonly updateId: null | string };
export type OtaError = "check-failed" | "download-failed" | "network-failed" | "restart-failed";
export type OtaState = {
  readonly status:
    | "checking"
    | "disabled"
    | "downloading"
    | "error"
    | "idle"
    | "ready"
    | "restarting"
    | "waiting-wifi";
  readonly error: null | OtaError;
  readonly ready: null | OtaReady;
  readonly lastCheckedAt: null | string;
  readonly diagnostics: OtaDiagnostics;
};
export type OtaPorts = {
  readonly isEnabled: boolean;
  readonly diagnostics: OtaDiagnostics;
  readonly now: () => number;
  readonly check: () => Promise<"available" | "none" | "rollback">;
  readonly network: () => Promise<"other" | "unknown" | "unmetered-wifi">;
  readonly fetch: () => Promise<OtaReady>;
  readonly reload: () => Promise<void>;
};
export type OtaCoordinator = {
  readonly store: StoreApi<OtaState>;
  readonly check: () => Promise<void>;
  readonly restart: () => Promise<void>;
  readonly dispose: () => void;
  readonly activate?: () => void;
};
type Context = {
  readonly owner?: number;
  readonly ports: OtaPorts;
  readonly store: StoreApi<OtaState>;
  readonly state: {
    generation: number;
    isActive: boolean;
    hasPending: boolean;
    lastCheck: null | number;
    lastFetchFailure: null | number;
    inFlight: null | Promise<void>;
    isRestarting: boolean;
  };
};
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

const isCurrent = (context: Context): boolean =>
  context.state.isActive &&
  (context.owner === undefined || context.owner === context.state.generation);

const fail = (context: Context, error: OtaError): void => {
  const { store } = context;
  if (isCurrent(context)) {
    store.setState({ status: "error", error });
  }
};

const canContinueAfterCheck = async (context: Context): Promise<boolean> => {
  const { ports, state, store } = context;
  const now = ports.now();
  if (state.lastCheck !== null && now - state.lastCheck < CHECK_INTERVAL_MS) {
    return true;
  }
  state.lastCheck = now;
  store.setState({ status: "checking", error: null });
  try {
    const result = await ports.check();
    if (!isCurrent(context)) {
      return false;
    }
    state.hasPending = result !== "none";
    store.setState({
      status: store.getState().ready === null ? "idle" : "ready",
      lastCheckedAt: new Date(now).toISOString(),
    });
    return true;
  } catch {
    fail(context, "check-failed");
    return false;
  }
};

const isDownloadAllowed = async (context: Context): Promise<boolean> => {
  const { ports, store } = context;
  try {
    const network = await ports.network();
    if (!isCurrent(context)) {
      return false;
    }
    if (network === "unmetered-wifi") {
      return true;
    }
    store.setState({ status: "waiting-wifi", error: null });
    return false;
  } catch {
    fail(context, "network-failed");
    return false;
  }
};

const canRetryFetch = ({ ports, state }: Context): boolean =>
  state.lastFetchFailure === null || ports.now() - state.lastFetchFailure >= CHECK_INTERVAL_MS;

const failFetch = (context: Context, attemptedAt: number): void => {
  const { state } = context;
  if (!isCurrent(context)) {
    return;
  }

  state.lastFetchFailure = attemptedAt;
  fail(context, "download-failed");
};

const download = async (context: Context): Promise<void> => {
  const { ports, state, store } = context;
  if (!canRetryFetch(context) || !(await isDownloadAllowed(context)) || !isCurrent(context)) {
    return;
  }
  store.setState({ status: "downloading", error: null });
  const attemptedAt = ports.now();
  try {
    const ready = await ports.fetch();
    if (!isCurrent(context)) {
      return;
    }
    state.hasPending = false;
    state.lastFetchFailure = null;
    store.setState({ status: "ready", ready, error: null });
  } catch {
    failFetch(context, attemptedAt);
  }
};

const runCheck = async (context: Context): Promise<void> => {
  if ((await canContinueAfterCheck(context)) && isCurrent(context) && context.state.hasPending) {
    await download(context);
  }
};

const trigger = async (context: Context): Promise<void> => {
  const { ports, state } = context;
  if (!state.isActive || !ports.isEnabled || state.isRestarting) {
    return;
  }
  if (state.inFlight !== null) {
    await state.inFlight;
    return;
  }
  state.inFlight = runCheck({ ...context, owner: state.generation });
  try {
    await state.inFlight;
  } finally {
    state.inFlight = null;
  }
};

const restart = async (context: Context): Promise<void> => {
  const { ports, state, store } = context;
  if (!state.isActive || state.isRestarting || store.getState().ready === null) {
    return;
  }
  const operation = { ...context, owner: state.generation };
  state.isRestarting = true;
  store.setState({ status: "restarting", error: null });
  try {
    await ports.reload();
  } catch {
    fail(operation, "restart-failed");
  } finally {
    if (isCurrent(operation)) {
      state.isRestarting = false;
    }
  }
};

/** Account-server independent lifecycle policy. Native code still verifies signed updates. */
export const createOtaCoordinator = (ports: OtaPorts): OtaCoordinator => {
  const store = createStore<OtaState>(() => ({
    status: ports.isEnabled ? "idle" : "disabled",
    error: null,
    ready: null,
    lastCheckedAt: null,
    diagnostics: ports.diagnostics,
  }));
  const context: Context = {
    ports,
    store,
    state: {
      generation: 0,
      isActive: true,
      hasPending: false,
      lastCheck: null,
      lastFetchFailure: null,
      inFlight: null,
      isRestarting: false,
    },
  };
  return {
    store,
    check: async () => {
      await trigger(context);
    },
    restart: async () => {
      await restart(context);
    },
    dispose: () => {
      context.state.isActive = false;
      context.state.isRestarting = false;
      context.state.generation += 1;
    },
    activate: () => {
      if (context.state.isActive) {
        return;
      }
      context.state.isActive = true;
      const inactiveStatus = ports.isEnabled ? "idle" : "disabled";
      store.setState({ status: store.getState().ready === null ? inactiveStatus : "ready" });
    },
  };
};
