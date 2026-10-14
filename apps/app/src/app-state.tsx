import * as Notifications from "expo-notifications";
import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { useStore } from "zustand";

import type { Auth, AuthState, AppState as ClientState, SyncStatus } from "@pace/client";

import {
  isAnswer,
  type Language,
  type MessageKey,
  type MessageParams,
  type Settings,
  t,
  type User,
} from "@pace/core";

import { IS_PHONE } from "./platform/device.ts";
import {
  answerFromButton,
  dismissPoolNotification,
  notificationIdOf,
  pollNow,
  pushStore,
  registerPush,
  setupNotificationCategories,
} from "./platform/notifications.ts";
import { uploadPhoneData } from "./platform/phone-upload.ts";
import { startPushTask } from "./platform/push-task.ts";
import { createRuntime, type PaceRuntime } from "./runtime.ts";

/**
How often the client pulls on its own. While the live channel is up the server says when
something changed, so the poll is only a safety net; while it is down it polls as before.
*/
const POLL_OFFLINE_MS = 30_000;
const POLL_LIVE_MS = 5 * 60_000;

const RuntimeContext = createContext<null | PaceRuntime>(null);

/** The phone's calendar and app usage, sent beside the event log (nothing on the web). */
const sendPhoneData = async (runtime: PaceRuntime): Promise<void> => {
  if (IS_PHONE) {
    await uploadPhoneData(runtime.api, runtime.clock.now());
  }
};

/**
The phone's side of the notification pool, on every start and return: the answer buttons,
the push method (registered again: a token may have changed) and, when it polls, what waits.
*/
const startPhonePush = async (runtime: PaceRuntime): Promise<void> => {
  if (!IS_PHONE) {
    return;
  }
  try {
    await setupNotificationCategories(runtime.state.store.getState().settings.language);
    await startPushTask();
    if ((await registerPush(runtime.api)) === "poll") {
      await pollNow(runtime.api);
    }
  } catch {
    // Offline: the next start or return tries again; the feed has everything meanwhile.
  }
};

/**
A signed-in start: this week's homework instances, a first sync, then the account's time
zone from the device when it has none yet (never "not set").
*/
const bootstrap = async (runtime: PaceRuntime): Promise<void> => {
  const { actions, auth, sync } = runtime;
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
What the live socket says about the pool, on a phone: a notification resolved elsewhere goes
away at once; a polling phone fetches what waits for it right away; changed push methods mean
registering again. And an answer button tapped while the app is open answers like the feed.
*/
const followPhoneNotices = (runtime: PaceRuntime): (() => void) => {
  if (!IS_PHONE) {
    return () => undefined;
  }
  const pollIfPolling = (): void => {
    if (pushStore.getState().method === "poll") {
      void (async () => {
        try {
          await pollNow(runtime.api);
        } catch {
          // Offline: the next notice or start fetches it.
        }
      })();
    }
  };
  const stopNotices = runtime.onNotice((notice) => {
    switch (notice.type) {
      case "push-methods-changed": {
        void startPhonePush(runtime);
        break;
      }
      case "dismiss": {
        void dismissPoolNotification(notice.id);
        pollIfPolling();
        break;
      }
      case "notification": {
        pollIfPolling();
        break;
      }
      case "read": {
        break;
      }
    }
  });
  const responses = Notifications.addNotificationResponseReceivedListener((response) => {
    const id = notificationIdOf(response.notification.request.content.data);
    if (id === null || !isAnswer(response.actionIdentifier)) {
      return;
    }
    const resolution = response.actionIdentifier;
    void answerFromButton({
      content: response.notification.request.content,
      id,
      save: async () => await runtime.notifications.resolve(id, resolution),
    });
  });
  return () => {
    stopNotices();
    responses.remove();
  };
};

/** Starts/stops the sync loop with the auth status; a foreground return syncs at once. */
const runSyncLoop = (runtime: PaceRuntime): (() => void) => {
  const { actions, auth, sync } = runtime;
  const follow = (status: AuthState["status"]): void => {
    if (status === "signed-in") {
      void bootstrap(runtime);
    } else {
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
    if (previous.status === "signed-in" && current.status === "signed-out") {
      void runtime.resetLocalData();
    }
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
  return () => {
    unsubscribe();
    subscription.remove();
    stopNotices();
    stopFollowingLive();
    sync.stop();
    runtime.live.stop();
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
