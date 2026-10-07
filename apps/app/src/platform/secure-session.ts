import * as SecureStore from "expo-secure-store";

import type { SessionStore } from "@pace/client";

const SESSION_KEY = "pace.session";

/** The bearer token in the Android Keystore-backed secure store. */
export const createSecureSessionStore = (): SessionStore => ({
  clear: async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  },
  get: async () => await SecureStore.getItemAsync(SESSION_KEY),
  set: async (token) => {
    await SecureStore.setItemAsync(SESSION_KEY, token);
  },
});
