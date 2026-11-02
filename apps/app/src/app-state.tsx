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

import { followPhoneNotices, sendPhoneData, startPhonePush } from "./phone-runtime.ts";
import { startBackgroundCheck, stopBackgroundCheck } from "./platform/background-check.ts";
import { deviceLanguage } from "./platform/device-language.ts";
import { IS_PHONE } from "./platform/device.ts";
import { clearPresentedPoolNotifications } from "./platform/notification-cleanup.ts";
import { useServerOrigin, watchServer } from "./platform/server-origin.ts";
import { createRuntime, type PaceRuntime } from "./runtime.ts";

/**
How often the client pulls on its own. While the live channel is up the server says when
something changed, so the poll is only a safety net; while it is down it polls as before.
*/
const POLL_OFFLINE_MS = 30_000;
const POLL_LIVE_MS = 5 * 60_000;

const RuntimeContext = createContext<null | PaceRuntime>(null);
/**
Which session's sync has finished: `ready` names the session whose last run succeeded (its
account settings are safe to show), `ended` the one whose last run finished at all, failed
included. A run of an earlier session never speaks for the current one (review m5).
*/
type SyncedSessions = { readonly ready: null | string; readonly ended: null | string };

const NO_SYNCED_SESSION: SyncedSessions = { ended: null, ready: null };

/** A run of `owner`'s session finished (`null`: signed out); a failed one keeps what was ready. */
type OnSynced = (owner: null | string, isSynced: boolean) => void;

const syncedAfter = (
  previous: SyncedSessions,
  owner: null | string,
  isSynced: boolean,
): SyncedSessions => {
  const next =
    owner === null ? NO_SYNCED_SESSION : { ended: owner, ready: isSynced ? owner : previous.ready };
  // The same answer keeps the same object: a sync every few minutes redraws nothing.
  return next.ended === previous.ended && next.ready === previous.ready ? previous : next;
};
const SyncedContext = createContext<SyncedSessions>(NO_SYNCED_SESSION);

/**
A signed-in start: this week's homework instances, a first sync, then the account's time
zone from the device when it has none yet (never "not set").
*/
const bootstrap = async (runtime: PaceRuntime): Promise<void> => {
  const { actions, auth, sync } = runtime;
  if (IS_PHONE) {
    // Every signed-in phone, before any network step (one failing must not skip it): it polls
    // when its method is `poll`, and always uploads its usage.
    void startBackgroundCheck();
  }
  await actions.ensureInstances();
  await sync.syncNow();
  await actions.ensureTimezone();
  await runtime.notifications.refresh();
  await sendPhoneData(runtime);
  await startPhonePush(runtime);
  // Signed out meanwhile: no loop. Otherwise its first tick pushes what the bootstrap added.
  if (auth.store.getState().status !== "signed-in") {
    return;
  }

  sync.start({ intervalMs: POLL_OFFLINE_MS });
  runtime.live.start();
};

/**
A finished sync is told for the session that started it: a successful one makes the account's
settings safe to show, any one ends the first-sync cover.
*/
const followSyncedLanguage = (runtime: PaceRuntime, onSynced: OnSynced): (() => void) => {
  const { auth, sync } = runtime;
  let syncOwner = sync.status.getState().syncing ? runtime.api.currentSessionToken() : undefined;
  return sync.status.subscribe((current, previous) => {
    if (current.syncing && !previous.syncing) {
      syncOwner = runtime.api.currentSessionToken();
    }
    if (
      syncOwner === undefined ||
      current.syncing ||
      !previous.syncing ||
      !runtime.api.isCurrentSession(syncOwner) ||
      auth.store.getState().status !== "signed-in"
    ) {
      return;
    }
    onSynced(syncOwner, current.lastError === null && current.lastSyncAt !== null);
  });
};

/** Starts/stops the sync loop with the auth status; a foreground return syncs at once. */
const runSyncLoop = (runtime: PaceRuntime, onSynced: OnSynced): (() => void) => {
  const { actions, auth, sync } = runtime;
  let activeSession = runtime.api.currentSessionToken();
  const stopLanguageSync = followSyncedLanguage(runtime, onSynced);
  const follow = (status: AuthState["status"]): void => {
    if (status === "signed-in") {
      activeSession = runtime.api.currentSessionToken();
      void (async () => {
        try {
          await bootstrap(runtime);
        } catch {
          // Offline mid-start: a return to the app syncs and registers again (no unhandled rejection).
        }
      })();
    } else {
      onSynced(null, false);
      sync.stop();
      runtime.live.stop();
    }
  };
  follow(auth.store.getState().status);
  const unsubscribe = auth.store.subscribe((current, previous) => {
    if (current.status === previous.status) {
      return;
    }
    follow(current.status);
    if (!(previous.status === "signed-in" && current.status === "signed-out")) {
      return;
    }

    if (IS_PHONE) {
      void stopBackgroundCheck();
    }
    if (activeSession !== undefined) {
      void clearPresentedPoolNotifications(activeSession);
    }
    activeSession = undefined;
    void runtime.resetLocalData();
  });
  // The poll is a safety net while the server can say "changed" itself.
  const stopFollowingLive = runtime.live.status.subscribe(({ isConnected }, previous) => {
    sync.setInterval(isConnected ? POLL_LIVE_MS : POLL_OFFLINE_MS);
    // Back on the line: what the pool got meanwhile.
    if (isConnected && !previous.isConnected) {
      void runtime.notifications.refresh();
    }
  });
  const subscription = AppState.addEventListener("change", (next) => {
    if (auth.store.getState().status !== "signed-in") {
      return;
    }
    if (next !== "active") {
      // Leaving (a hidden tab, the app in the background): what is unsent goes now, and the
      // socket rests until the person is back.
      void sync.syncNow();
      runtime.live.stop();
      return;
    }
    runtime.live.start();

    void actions.ensureInstances();
    void (async () => {
      await sync.syncNow();
      await runtime.notifications.refresh();
      await sendPhoneData(runtime);
      await startPhonePush(runtime);
    })();
  });
  const stopNotices = followPhoneNotices(runtime);
  const stopServerChecks = watchServer(runtime);
  return () => {
    stopServerChecks();
    unsubscribe();
    subscription.remove();
    stopNotices();
    stopLanguageSync();
    stopFollowingLive();
    sync.stop();
    runtime.live.stop();
  };
};

/**
Wires auth → API → app state → sync for the whole app, for the chosen server. Renders a blank
view until the platform adapters are ready (the splash screen is still up), then the children.
*/
export const PaceProvider = ({
  children,
  runtime: provided,
}: {
  readonly children: ReactNode;
  readonly runtime?: PaceRuntime;
}) => {
  const [runtime, setRuntime] = useState<null | PaceRuntime>(provided ?? null);
  const [synced, setSynced] = useState<SyncedSessions>(NO_SYNCED_SESSION);
  const origin = useServerOrigin(provided === undefined);

  useEffect(() => {
    if (provided !== undefined || origin === null) {
      return;
    }
    const lifetime = new AbortController();
    let created: PaceRuntime | undefined;
    void (async () => {
      created = await createRuntime({ baseUrl: origin });
      if (lifetime.signal.aborted) {
        // Dropped before it was used (React's second effect run in development): let it go whole.
        created.close();
        return;
      }
      setRuntime(created);
    })();
    return () => {
      lifetime.abort();
      // Replaced for another server: it stops hearing the other tabs (review m1).
      created?.close();
    };
  }, [provided, origin]);

  useEffect(
    () =>
      runtime === null
        ? undefined
        : runSyncLoop(runtime, (owner, isSynced) => {
            setSynced((previous) => syncedAfter(previous, owner, isSynced));
          }),
    [runtime],
  );

  return runtime === null ? (
    <View className="flex-1 bg-bg" />
  ) : (
    <RuntimeContext value={runtime}>
      <SyncedContext value={synced}>{children}</SyncedContext>
    </RuntimeContext>
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
  /** Signed out because the server no longer knew the session: the login card says so. */
  readonly endedElsewhere: boolean;
  readonly status: AuthState["status"];
  readonly user: null | User;
} => {
  const { auth } = usePace();
  const { endedElsewhere, status, user } = useStore(auth.store);
  return { auth, endedElsewhere: endedElsewhere === true, status, user };
};

/**
The owner's first name from their Telegram profile. A session that began before the server kept it
falls back to the first word of their full name; null until the server has told who they are.
*/
export const useOwnerName = (): null | string => {
  const { user } = useAuth();
  const name = (user?.firstName ?? user?.name.split(/\s+/u, 1)[0])?.trim();
  return name === undefined || name === "" ? null : name;
};

export const useSync = (): {
  readonly status: SyncStatus;
  readonly syncNow: () => Promise<unknown>;
} => {
  const { sync } = usePace();
  return { status: useStore(sync.status), syncNow: sync.syncNow };
};

/**
Signed in on a copy that held nothing when this session's first sync began, until that sync has
finished: the screens would show their final empty states, then the pulled log in the device's
language, and only then the account's (QA round 17 M4). A copy that held the log is never
covered; a failed sync ends it too (the offline strip says why), so a copy that cannot reach the
server is never hidden for good.
*/
export const useIsFirstSync = (): boolean => {
  const { status } = useAuth();
  const { api, hooks } = usePace();
  const { ended } = use(SyncedContext);
  const isLoading = hooks.useAppState((state) => state.status === "loading");
  const isEmpty = hooks.useAppState(
    (state) => state.status === "ready" && state.events.length === 0,
  );
  // Only a run of this session ends it: an earlier session's failure still sits in `lastError`.
  const hasEnded = ended !== null && ended === api.currentSessionToken();
  const isWaiting = status === "signed-in" && !hasEnded;
  // Once read empty, the copy stays covered while its first pages arrive, until the sync ends; a
  // copy still being read from the device is covered only until it is read (local first).
  const [wasEmpty, setWasEmpty] = useState(false);
  const isEmptyCopy = isWaiting && (isEmpty || wasEmpty);
  if (wasEmpty !== isEmptyCopy) {
    setWasEmpty(isEmptyCopy);
  }
  return isEmptyCopy || (isWaiting && isLoading);
};

/**
Signed in and this session's last sync could not reach the server (QA round 17 M5); what an
earlier session's sync found says nothing about this one (review m5).
*/
export const useIsOffline = (): boolean => {
  const { status } = useAuth();
  const { api, sync } = usePace();
  const { ended } = use(SyncedContext);
  const isOnline = useStore(sync.status, (current) => current.online);
  return (
    status === "signed-in" && !isOnline && ended !== null && ended === api.currentSessionToken()
  );
};

export const useAppState = <T,>(selector: (state: ClientState) => T): T =>
  usePace().hooks.useAppState(selector);

export const useSettings = (): Settings => useAppState((state) => state.settings);

export const useLanguage = (): Language => {
  const { status } = useAuth();
  const { api } = usePace();
  const readyToken = use(SyncedContext).ready;
  const accountLanguage = useAppState((state) => state.settings.language);
  return status === "signed-in" && readyToken !== null && readyToken === api.currentSessionToken()
    ? accountLanguage
    : deviceLanguage();
};

/** `t` bound to the account language. */
export const useT = (): ((key: MessageKey, params?: MessageParams) => string) => {
  const language = useLanguage();
  return useCallback(
    (key: MessageKey, params?: MessageParams) => t(language, key, params),
    [language],
  );
};
