import * as SecureStore from "expo-secure-store";

import type { Instance } from "@pace/core";

import { API_BASE_URL } from "./api-base.ts";
import { clearStoredSession } from "./secure-session.ts";
import { serverStore } from "./server-store.ts";

const SERVER_KEY = "pace.server";

/** The server this phone talks to: the one the person chose, or the build's. */
export const readServer = async (): Promise<string> => {
  try {
    return (await SecureStore.getItemAsync(SERVER_KEY)) ?? API_BASE_URL;
  } catch {
    return API_BASE_URL;
  }
};

/**
Remembers the chosen server (`null`: the build's again). The stored token goes with the old one:
it was issued there and is never sent anywhere else.
*/
export const writeServer = async (origin: null | string): Promise<void> => {
  await clearStoredSession();
  await (origin === null || origin === API_BASE_URL
    ? SecureStore.deleteItemAsync(SERVER_KEY)
    : SecureStore.setItemAsync(SERVER_KEY, origin));
};

/**
Moves the app to another server (signed out, from the login screen): the local log of the old one
goes, the choice is stored, and the store's new origin makes the provider build a runtime for it.
`instance` is what the server answered when the person checked it.
*/
export const switchServer = async (
  runtime: { readonly resetLocalData: () => Promise<void> },
  choice: null | { readonly origin: string; readonly instance: Instance },
): Promise<void> => {
  await runtime.resetLocalData();
  await writeServer(choice?.origin ?? null);
  serverStore.setState({
    instance: choice?.instance ?? null,
    origin: choice?.origin ?? API_BASE_URL,
    reason: null,
    status: choice === null ? "unknown" : "ok",
  });
};
