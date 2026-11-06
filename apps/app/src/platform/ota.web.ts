import { createOtaCoordinator, type OtaCoordinator } from "./ota-coordinator.ts";

const NOTHING = (): void => undefined;

/** Native coordinator is disabled in browsers; their update path remains the service worker. */
export const createNativeOtaCoordinator = (): OtaCoordinator =>
  createOtaCoordinator({
    isEnabled: false,
    diagnostics: {
      apkVersion: null,
      runtimeVersion: null,
      updateId: null,
      createdAt: null,
      isEmbeddedLaunch: true,
      isEmergencyLaunch: false,
      emergencyLaunchReason: null,
    },
    now: Date.now,
    check: () => Promise.resolve("none"),
    network: () => Promise.resolve("unknown"),
    fetch: () => Promise.reject(new Error("native-updates-disabled")),
    reload: () => Promise.resolve(),
  });
export const startNativeOtaUpdates = (_coordinator: OtaCoordinator): (() => void) => NOTHING;
