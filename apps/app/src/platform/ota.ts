import * as Network from "expo-network";
import * as Updates from "expo-updates";
import { AppState } from "react-native";

import { paceNative } from "../../modules/pace-native/index.ts";
import { createOtaCoordinator, type OtaCoordinator } from "./ota-coordinator.ts";
import { createExpoOtaPorts } from "./ota-expo.ts";
import { startOtaLifecycle } from "./ota-lifecycle.ts";

export const createNativeOtaCoordinator = (): OtaCoordinator =>
  createOtaCoordinator(
    createExpoOtaPorts({
      updates: Updates,
      apkVersion: typeof paceNative.apkVersion === "function" ? paceNative.apkVersion() : null,
      now: Date.now,
      network: () => (typeof paceNative.otaNetwork === "function" ? paceNative.otaNetwork() : null),
    }),
  );

/** App-lifetime observers: never owned by the selected account server or its auth state. */
export const startNativeOtaUpdates = (coordinator: OtaCoordinator): (() => void) => {
  if (coordinator.store.getState().status === "disabled") {
    return coordinator.dispose;
  }
  const stopForeground = startOtaLifecycle(coordinator, {
    subscribe: (onActive) => {
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          onActive();
        }
      });
      return () => {
        subscription.remove();
      };
    },
  });
  try {
    const network = Network.addNetworkStateListener(() => {
      void coordinator.check();
    });
    return () => {
      network.remove();
      stopForeground();
    };
  } catch {
    coordinator.store.setState({ status: "error", error: "network-failed" });
    return stopForeground;
  }
};
