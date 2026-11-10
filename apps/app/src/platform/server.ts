import * as SecureStore from "expo-secure-store";

import type { Instance } from "@pace/core";

import { type Auth, checkInstance } from "@pace/client";

import { API_BASE_URL } from "./api-base.ts";
import {
  commitRuntimeFirebase,
  isRuntimeFirebase,
  prepareRuntimeFirebase,
  reconcileRuntimeFirebase,
  restartRuntimeFirebase,
  stageRuntimeFirebase,
} from "./firebase-runtime.ts";
import { clearStoredSession } from "./secure-session.ts";
import { serverStore } from "./server-store.ts";
import { serverSwitchStore } from "./server-switch-state.ts";

const SERVER_KEY = "pace.server";

/** The server this phone talks to: the one the person chose, or the build's. */
export const readServer = async (): Promise<string> => {
  try {
    return (await SecureStore.getItemAsync(SERVER_KEY)) ?? API_BASE_URL;
  } catch {
    if (isRuntimeFirebase()) {
      throw new Error("server-read-failed");
    }
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

type ServerChoice = null | { readonly origin: string; readonly instance: Instance };
type SwitchRuntime = {
  readonly resetLocalData: () => Promise<void>;
  readonly auth?: Pick<Auth, "resumeSignIn" | "suspendSignIn">;
};
type Target = NonNullable<ServerChoice>;

const checkedTarget = async (choice: ServerChoice): Promise<Target> => {
  if (choice !== null) {
    return choice;
  }
  const result = await checkInstance(API_BASE_URL);
  if (!result.ok) {
    throw new Error("server-check-failed");
  }
  return { origin: API_BASE_URL, instance: result.value };
};

const recoverSelection = async (runtime: SwitchRuntime): Promise<void> => {
  const persisted = await readServer();
  reconcileRuntimeFirebase(persisted);
  const current = serverStore.getState();
  if (current.origin !== persisted) {
    return;
  }

  runtime.auth?.resumeSignIn();
  if (current.instance !== null) {
    prepareRuntimeFirebase(persisted, current.instance);
  }
};

const switchRuntimeServer = async (runtime: SwitchRuntime, target: Target): Promise<void> => {
  stageRuntimeFirebase(target.origin, target.instance);
  try {
    await runtime.auth?.suspendSignIn();
    await runtime.resetLocalData();
    await writeServer(target.origin);
    // From this point the old runtime must never offer sign-in again, even if restart fails.
    serverSwitchStore.setState({ origin: target.origin });
    commitRuntimeFirebase(target.origin);
    restartRuntimeFirebase();
  } catch (error) {
    // Restore authority from the durable choice, never from the attempted target.
    await recoverSelection(runtime);
    throw error;
  }
};

const performSwitch = async (runtime: SwitchRuntime, choice: ServerChoice): Promise<void> => {
  if (isRuntimeFirebase()) {
    await switchRuntimeServer(runtime, await checkedTarget(choice));
    return;
  }
  await runtime.resetLocalData();
  await writeServer(choice?.origin ?? null);
  serverStore.setState({
    configurationError: null,
    instance: choice?.instance ?? null,
    origin: choice?.origin ?? API_BASE_URL,
    reason: null,
    status: choice === null ? "unknown" : "ok",
  });
};

// A selection owns the whole persistence sequence; overlapping taps share its result.
const moving: { current: null | Promise<void> } = { current: null };
const runSwitch = async (runtime: SwitchRuntime, choice: ServerChoice): Promise<void> => {
  try {
    await performSwitch(runtime, choice);
  } finally {
    moving.current = null;
  }
};

export const switchServer = (runtime: SwitchRuntime, choice: ServerChoice): Promise<void> => {
  moving.current ??= runSwitch(runtime, choice);
  return moving.current;
};
