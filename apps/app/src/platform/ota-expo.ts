import type * as Updates from "expo-updates";

import type { OtaPorts, OtaReady } from "./ota-coordinator.ts";

export type ExpoOtaModule = Pick<
  typeof Updates,
  | "checkForUpdateAsync"
  | "createdAt"
  | "emergencyLaunchReason"
  | "fetchUpdateAsync"
  | "isEmbeddedLaunch"
  | "isEmergencyLaunch"
  | "isEnabled"
  | "reloadAsync"
  | "runtimeVersion"
  | "updateId"
>;
export type OtaNetworkSnapshot = null | { readonly isWifi: boolean; readonly isMetered: boolean };
type ExpoPortsInput = {
  readonly updates: ExpoOtaModule;
  readonly apkVersion: null | string;
  readonly network: () => OtaNetworkSnapshot;
  readonly now: () => number;
};

const fetchReady = async (updates: ExpoOtaModule): Promise<OtaReady> => {
  const result = await updates.fetchUpdateAsync();
  if (result.isRollBackToEmbedded) {
    return { kind: "rollback", updateId: null };
  }
  if (!result.isNew) {
    throw new Error("ota-download-unavailable");
  }
  const updateId = result.manifest.id;
  return { kind: "update", updateId };
};

const networkOf = (snapshot: OtaNetworkSnapshot): "other" | "unknown" | "unmetered-wifi" => {
  if (snapshot === null) {
    return "unknown";
  }
  return snapshot.isWifi && !snapshot.isMetered ? "unmetered-wifi" : "other";
};

/** Native configuration selects the publisher and verifies signatures; no account API enters here. */
export const createExpoOtaPorts = ({
  updates,
  apkVersion,
  network,
  now,
}: ExpoPortsInput): OtaPorts => ({
  isEnabled: updates.isEnabled,
  diagnostics: {
    apkVersion,
    runtimeVersion: updates.runtimeVersion,
    updateId: updates.updateId,
    createdAt: updates.createdAt?.toISOString() ?? null,
    isEmbeddedLaunch: updates.isEmbeddedLaunch,
    isEmergencyLaunch: updates.isEmergencyLaunch,
    emergencyLaunchReason: updates.emergencyLaunchReason,
  },
  now,
  check: async () => {
    const result = await updates.checkForUpdateAsync();
    if (result.isRollBackToEmbedded) {
      return "rollback";
    }
    return result.isAvailable ? "available" : "none";
  },
  network: () => Promise.resolve(networkOf(network())),
  fetch: async () => await fetchReady(updates),
  reload: async () => {
    await updates.reloadAsync();
  },
});
