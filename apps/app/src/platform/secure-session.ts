import * as SecureStore from "expo-secure-store";

import type { SessionStore } from "@pace/client";

import { API_BASE_URL } from "./api-base.ts";

const SESSION_KEY = "pace.session";

type StoredSession = { readonly origin: string; readonly token: string };

/**
What is stored, with the server it belongs to. A bare token was written before a server could be
chosen, when every token was the build's own server's.
*/
const parseStored = (raw: string): StoredSession => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "origin" in parsed &&
      "token" in parsed &&
      typeof parsed.origin === "string" &&
      typeof parsed.token === "string"
    ) {
      return { origin: parsed.origin, token: parsed.token };
    }
  } catch {
    // Not JSON: a bare token from before.
  }
  return { origin: API_BASE_URL, token: raw };
};

/**
The bearer token in the Android Keystore-backed secure store (localStorage on the web), kept with
the origin of the server that issued it: a store for another server reads it as signed out, so a
token is never sent to a server it does not belong to.
*/
export const createSecureSessionStore = (origin: string): SessionStore => ({
  clear: async () => {
    await clearStoredSession();
  },
  get: async () => {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (raw === null) {
      return null;
    }
    const stored = parseStored(raw);
    return stored.origin === origin ? stored.token : null;
  },
  set: async (token) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ origin, token }));
  },
});

/** Forgets the stored token whichever server it was for (a server switch). */
export const clearStoredSession = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(SESSION_KEY);
};
