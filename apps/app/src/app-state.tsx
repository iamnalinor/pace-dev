import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { View } from "react-native";
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

import { deviceLanguage } from "./platform/device-language.ts";
import { useServerOrigin } from "./platform/server-origin.ts";
import { createRuntime, type PaceRuntime } from "./runtime.ts";
import { runSyncLoop } from "./sync-loop.ts";
import { DraftOwnerContext } from "./ui/use-draft.ts";

const RuntimeContext = createContext<null | PaceRuntime>(null);
/**
Which session's sync has finished: `ready` names the session whose last run succeeded (its
account settings are safe to show), `ended` the one whose last run finished at all, failed
included. A run of an earlier session never speaks for the current one (review m5).
*/
type SyncedSessions = { readonly ready: null | string; readonly ended: null | string };

const NO_SYNCED_SESSION: SyncedSessions = { ended: null, ready: null };

/** A run of `owner`'s session finished (`null`: signed out); a failed one keeps what was ready. */
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

/** The dev gallery shows a subtree in the language its URL names, whatever the account says. */
export const LanguageOverrideContext = createContext<Language | null>(null);

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
    <View className="flex-1 bg-app" />
  ) : (
    <RuntimeContext value={runtime}>
      <SyncedContext value={synced}>
        <DraftOwnerContext value={runtime.api.currentSessionToken}>{children}</DraftOwnerContext>
      </SyncedContext>
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
    (state) => state.status === "ready" && state.knownEventIds.size === 0,
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
12, class 22). Every placeholder waits on it too (`EmptyState`, `EmptyText`, `FirstSyncBody`,
`KnownAfterSync`), so a failed first sync keeps grey rows rather than a final empty copy (QA round 21
M4); `useIsFirstSync` is left to the cover and the share focus.
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
  const override = use(LanguageOverrideContext);
  const accountLanguage = useAppState((state) => state.settings.language);
  if (override !== null) {
    return override;
  }
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
