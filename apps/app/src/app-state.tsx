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
import { forgetLineDraft } from "./platform/shared-in.ts";
import { type Pool, poolOf, retryOnWindowFocus } from "./runtime-pool.ts";
import { createRuntime, type PaceRuntime } from "./runtime.ts";
import { canStartSenders, POLL_LIVE_MS, POLL_OFFLINE_MS, startSenders } from "./senders.ts";

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
const bootstrap = async (runtime: PaceRuntime, pool: Pool): Promise<void> => {
  const { actions, sync } = runtime;
  if (IS_PHONE) {
    // Every signed-in phone, before any network step (one failing must not skip it): it polls
    // when its method is `poll`, and always uploads its usage.
    void startBackgroundCheck();
  }
  await actions.ensureInstances();
  await sync.syncNow();
  await actions.ensureTimezone();
  await pool.refresh();
  await sendPhoneData(runtime);
  await startPhonePush(runtime);
  // Signed out meanwhile, or ending this device's session: no loop, no socket. Otherwise its
  // first tick pushes what the bootstrap added.
  startSenders(runtime);
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

/**
The local copy (IndexedDB, shared by a browser's tabs) goes on sign-out only when no session is
left in the shared store: a stale tab's late 401 never wipes the copy of the tab that signed in
since (round 6 I1). A different account there gets a new store id, and its first pull drops the
old copy on its own.
*/
const dropLocalCopyIfOwned = async (runtime: PaceRuntime): Promise<void> => {
  if (!(await runtime.auth.isSessionStored())) {
    await runtime.resetLocalData();
  }
};

/** Starts/stops the sync loop with the auth status; a foreground return syncs at once. */
const runSyncLoop = (runtime: PaceRuntime, onSynced: OnSynced): (() => void) => {
  const { actions, auth, sync } = runtime;
  let activeSession = runtime.api.currentSessionToken();
  const pool = poolOf(runtime);
  const stopLanguageSync = followSyncedLanguage(runtime, onSynced);
  const follow = (status: AuthState["status"]): void => {
    if (status === "signed-in") {
      activeSession = runtime.api.currentSessionToken();
      void (async () => {
        try {
          await bootstrap(runtime, pool);
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
    // The half-typed line was this account's: a share after the next sign-in is only the share.
    forgetLineDraft();
    void dropLocalCopyIfOwned(runtime);
  });
  // The poll is a safety net while the server can say "changed" itself.
  const stopFollowingLive = runtime.live.status.subscribe(({ isConnected }, previous) => {
    sync.setInterval(isConnected ? POLL_LIVE_MS : POLL_OFFLINE_MS);
    // Back on the line: what the pool got meanwhile, unless it was just fetched.
    if (isConnected && !previous.isConnected && !pool.isFresh()) {
      void pool.refresh();
    }
  });
  const subscription = AppState.addEventListener("change", (next) => {
    // Signed out, or ending this device's session: nothing to send, no socket to rest or start.
    if (!canStartSenders(runtime)) {
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
      await pool.refresh();
      await sendPhoneData(runtime);
      await startPhonePush(runtime);
    })();
  });
  const stopNotices = followPhoneNotices(runtime);
  const stopServerChecks = watchServer(runtime);
  const stopFocus = retryOnWindowFocus(runtime);
  return () => {
    stopFocus();
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
  /** Signed out because another tab of this browser signed out (QA round 18 L3). */
  readonly endedInAnotherTab: boolean;
  readonly status: AuthState["status"];
  readonly user: null | User;
} => {
  const { auth } = usePace();
  const { endedElsewhere, endedInAnotherTab, status, user } = useStore(auth.store);
  return {
    auth,
    endedElsewhere: endedElsewhere === true,
    endedInAnotherTab: endedInAnotherTab === true,
    status,
    user,
  };
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
Signed in on a copy that held nothing when this session's sync began, until `isDone` (a run of
this session ended, or one succeeded): once read empty, the copy stays covered while its first
pages arrive; a copy still being read from the device is covered only until it is read (local
first). A copy that held the log is never covered.
*/
const useIsEmptyCopyUntil = (isDone: boolean): boolean => {
  const { status } = useAuth();
  const { hooks } = usePace();
  const isLoading = hooks.useAppState((state) => state.status === "loading");
  const isEmpty = hooks.useAppState(
    (state) => state.status === "ready" && state.events.length === 0,
  );
  const isWaiting = status === "signed-in" && !isDone;
  const [wasEmpty, setWasEmpty] = useState(false);
  const isEmptyCopy = isWaiting && (isEmpty || wasEmpty);
  if (wasEmpty !== isEmptyCopy) {
    setWasEmpty(isEmptyCopy);
  }
  return isEmptyCopy || (isWaiting && isLoading);
};

/**
Signed in on a copy that held nothing when this session's first sync began, until that sync has
finished: the screens would show their final empty states, then the pulled log in the device's
language, and only then the account's (QA round 17 M4). A failed sync ends it too (the offline
strip says why), so a copy that cannot reach the server is never hidden for good.
*/
export const useIsFirstSync = (): boolean => {
  const { api } = usePace();
  const { ended } = use(SyncedContext);
  // Only a run of this session ends it: an earlier session's failure still sits in `lastError`.
  return useIsEmptyCopyUntil(ended !== null && ended === api.currentSessionToken());
};

/**
Whether the account's own values (its settings) are still unknown on an empty copy: until a run
of this session has succeeded. Unlike `useIsFirstSync`, a failed first sync does not end it, or
the defaults would show as the account's with live controls that write over them (round 7 review
12, class 22); the rest of the app shows its real empty state meanwhile.
*/
export const useIsAccountUnknown = (): boolean => {
  const { api } = usePace();
  const { ready } = use(SyncedContext);
  return useIsEmptyCopyUntil(ready !== null && ready === api.currentSessionToken());
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
