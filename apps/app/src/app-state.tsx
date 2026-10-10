import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { useStore } from "zustand";

import {
  type Auth,
  type AuthState,
  type AppState as ClientState,
  type SyncStatus,
  timeBarModel,
} from "@pace/client";
import {
  type Language,
  type MessageKey,
  type MessageParams,
  type Settings,
  t,
  type User,
} from "@pace/core";

import { syncActivityTimers, syncLocalNotifications } from "./platform/notifications.ts";
import { type PhoneContext, startPhoneChecks } from "./platform/phone-background.ts";
import { createRuntime, type PaceRuntime } from "./runtime.ts";
import { remindCalendar } from "./shared/tracking/calendar-reminders.ts";

const SYNC_INTERVAL_MS = 30_000;

const RuntimeContext = createContext<null | PaceRuntime>(null);

/**
A signed-in start: this week's homework instances, a first sync, then the account's time
zone from the device when it has none yet (never "not set").
*/
/** The account's language and zone, for the background phone check that runs without a store. */
const phoneContextOf = (runtime: PaceRuntime): PhoneContext => {
  const { settings } = runtime.state.store.getState();
  return { language: settings.language, zone: settings.timezone ?? runtime.clock.deviceTz };
};

const bootstrap = async (runtime: PaceRuntime): Promise<void> => {
  const { actions, auth, sync } = runtime;
  await actions.ensureInstances();
  await sync.syncNow();
  await actions.ensureTimezone();
  await syncLocalNotifications(runtime);
  await remindCalendar(runtime);
  await startPhoneChecks(phoneContextOf(runtime));
  // Signed out meanwhile: no loop. Otherwise its first tick pushes what the bootstrap added.
  if (auth.store.getState().status === "signed-in") {
    sync.start({ intervalMs: SYNC_INTERVAL_MS });
  }
};

/** The running activity and its targets: the timers change only when this does. */
const timerKey = (runtime: PaceRuntime): string => {
  const { running } = timeBarModel(runtime.state.store.getState(), {
    deviceTz: runtime.clock.deviceTz,
    now: runtime.clock.now(),
  });
  return running === null
    ? ""
    : [running.activityId, running.startAt, running.label, running.expectMinutes].join("|");
};

/** Reschedules the phone's "still doing this?" timer on every switch, stop or edit of the running activity. */
const followActivityTimers = (runtime: PaceRuntime): (() => void) => {
  let last = timerKey(runtime);
  void syncActivityTimers(runtime);
  return runtime.state.store.subscribe(() => {
    const key = timerKey(runtime);
    if (key === last) {
      return;
    }

    last = key;
    void syncActivityTimers(runtime);
  });
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
    if (!(next === "active" && auth.store.getState().status === "signed-in")) {
      return;
    }

    void actions.ensureInstances();
    void (async () => {
      await sync.syncNow();
      await syncLocalNotifications(runtime);
      await remindCalendar(runtime);
      await startPhoneChecks(phoneContextOf(runtime));
    })();
  });
  const stopTimers = followActivityTimers(runtime);
  return () => {
    unsubscribe();
    subscription.remove();
    stopTimers();
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
