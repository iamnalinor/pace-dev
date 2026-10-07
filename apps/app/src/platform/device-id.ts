import * as SecureStore from "expo-secure-store";

import { newId } from "@pace/core";

const DEVICE_ID_KEY = "pace.deviceId";

/** A stable per-install id (stamped on every event this device records). */
export const loadDeviceId = async (): Promise<string> => {
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored !== null) {
    return stored;
  }
  const minted = newId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, minted);
  return minted;
};
