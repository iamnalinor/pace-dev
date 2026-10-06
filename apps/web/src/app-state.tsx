import { createContext, type ReactNode, useContext, useEffect } from "react";
import { toast } from "sonner";

import { type AppState, type Auth, type AuthState, type SyncClient, type SyncStatus } from "@pace/client";
import { useStore } from "@pace/client/react";
import { type Language, t } from "@pace/core";

import type { PaceServices } from "./services.ts";

const SYNC_INTERVAL_MS = 30_000;

const ServicesContext = createContext<null | PaceServices>(null);

export const useServices = (): PaceServices => {
  const services = useContext(ServicesContext);
  if (services === null) {
    throw new Error("useServices must be used inside <PaceProvider>");
  }
  return services;
};

export const useAuth = (): AuthState & { readonly auth: Auth } => {
  const { auth } = useServices();
  const state = useStore(auth.store);
  return { ...state, auth };
};

export const useSync = (): SyncStatus & { readonly sync: SyncClient } => {
  const { sync } = useServices();
  const status = useStore(sync.status);
  return { ...status, sync };
};

export const useAppState = <T,>(selector: (state: AppState) => T): T =>
  useServices().hooks.useAppState(selector);

export const useLanguage = (): Language => useServices().hooks.useLanguage();

/** Runs the sync loop while signed in: every 30s, plus on focus and when back online. */
const runSyncLoop = (services: PaceServices): (() => void) => {
  const { auth, sync } = services;
  const syncNow = (): void => {
    void sync.syncNow();
  };
  let isRunning = false;
  const stop = (): void => {
    if (!isRunning) {
      return;
    }
    isRunning = false;
    sync.stop();
    window.removeEventListener("focus", syncNow);
    window.removeEventListener("online", syncNow);
  };
  const start = (): void => {
    if (isRunning) {
      return;
    }
    isRunning = true;
    sync.start({ intervalMs: SYNC_INTERVAL_MS });
    window.addEventListener("focus", syncNow);
    window.addEventListener("online", syncNow);
  };
  const apply = (state: AuthState): void => {
    if (state.status === "signed-in") {
      start();
      if (state.user === null) {
        void auth.me();
      }
    } else {
      stop();
    }
  };
  apply(auth.store.getState());
  const unsubscribe = auth.store.subscribe(apply);
  return () => {
    unsubscribe();
    stop();
  };
};

/** Surfaces every new sync failure once, in the account language. */
const reportSyncErrors = (services: PaceServices): (() => void) =>
  services.sync.status.subscribe((status, previous) => {
    if (status.lastError !== null && status.lastError !== previous.lastError) {
      const language = services.state.store.getState().settings.language;
      toast.error(t(language, "errors.syncFailed", { reason: status.lastError }));
    }
  });

export const PaceProvider = ({
  children,
  services,
}: {
  readonly children: ReactNode;
  readonly services: PaceServices;
}) => {
  useEffect(() => runSyncLoop(services), [services]);
  useEffect(() => reportSyncErrors(services), [services]);
  return <ServicesContext value={services}>{children}</ServicesContext>;
};
