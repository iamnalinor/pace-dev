import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { useStore } from "zustand";

import type { Auth, AuthState, AppState as ClientState, SyncStatus } from "@pace/client";

import {
  type Language,
  type MessageKey,
  type MessageParams,
  type Settings,
  t,
  type User,
} from "@pace/core";

import { createRuntime, type PaceRuntime } from "./runtime.ts";

const SYNC_INTERVAL_MS = 30_000;

const RuntimeContext = createContext<null | PaceRuntime>(null);

/**
A signed-in start: this week's homework instances, a first sync, then the account's time
zone from the device when it has none yet (never "not set").
*/
const bootstrap = async ({ actions, auth, sync }: PaceRuntime): Promise<void> => {
  await actions.ensureInstances();
  await sync.syncNow();
  await actions.ensureTimezone();
  // Signed out meanwhile: no loop. Otherwise its first tick pushes what the bootstrap added.
  if (auth.store.getState().status === "signed-in") {
    sync.start({ intervalMs: SYNC_INTERVAL_MS });
  }
};

/** Starts/stops the sync loop with the auth status; a foreground return syncs at once. */
const runSyncLoop = (runtime: PaceRuntime): (() => void) => {
  const { actions, auth, sync } = runtime;
  const follow = (status: AuthState["status"]): void => {
    if (status === "signed-in") {
      void bootstrap(runtime);
    } else {
      sync.stop();
    }
  };
  follow(auth.store.getState().status);
  const unsubscribe = auth.store.subscribe((current, previous) => {
    if (current.status === previous.status) {
      return;
    }
    follow(current.status);
    if (previous.status === "signed-in" && current.status === "signed-out") {
      void runtime.resetLocalData();
    }
  });
  const subscription = AppState.addEventListener("change", (next) => {
    if (next === "active" && auth.store.getState().status === "signed-in") {
      void actions.ensureInstances();
      void sync.syncNow();
    }
  });
  return () => {
    unsubscribe();
    subscription.remove();
    sync.stop();
  };
};

/**
Wires auth → API → app state → sync for the whole app. Renders a blank view until the
platform adapters are ready (the splash screen is still up), then the children.
*/
export const PaceProvider = ({
  children,
  runtime: provided,
}: {
  readonly children: ReactNode;
  readonly runtime?: PaceRuntime;
}) => {
  const [runtime, setRuntime] = useState<null | PaceRuntime>(provided ?? null);

  useEffect(() => {
    if (provided !== undefined) {
      return;
    }
    const lifetime = new AbortController();
    void (async () => {
      const created = await createRuntime();
      if (!lifetime.signal.aborted) {
        setRuntime(created);
      }
    })();
    return () => {
      lifetime.abort();
    };
  }, [provided]);

  useEffect(() => (runtime === null ? undefined : runSyncLoop(runtime)), [runtime]);

  return runtime === null ? (
    <View className="flex-1 bg-bg" />
  ) : (
    <RuntimeContext value={runtime}>{children}</RuntimeContext>
  );
};

export const usePace = (): PaceRuntime => {
  const runtime = use(RuntimeContext);
  if (runtime === null) {
    throw new Error("usePace needs a PaceProvider above it");
  }
  return runtime;
};

export const useAuth = (): {
  readonly auth: Auth;
  readonly status: AuthState["status"];
  readonly user: null | User;
} => {
  const { auth } = usePace();
  const { status, user } = useStore(auth.store);
  return { auth, status, user };
};

export const useSync = (): {
  readonly status: SyncStatus;
  readonly syncNow: () => Promise<unknown>;
} => {
  const { sync } = usePace();
  return { status: useStore(sync.status), syncNow: sync.syncNow };
};

export const useAppState = <T,>(selector: (state: ClientState) => T): T =>
  usePace().hooks.useAppState(selector);

export const useSettings = (): Settings => useAppState((state) => state.settings);

export const useLanguage = (): Language => useAppState((state) => state.settings.language);

/** `t` bound to the account language. */
export const useT = (): ((key: MessageKey, params?: MessageParams) => string) => {
  const language = useLanguage();
  return useCallback(
    (key: MessageKey, params?: MessageParams) => t(language, key, params),
    [language],
  );
};
