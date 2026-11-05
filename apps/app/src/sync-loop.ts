import { AppState } from "react-native";

import type { AuthState } from "@pace/client";

import type { PaceRuntime } from "./runtime.ts";

import { bootstrap } from "./bootstrap.ts";
import { dropLocalCopyOnSignOut, signOutCauseOf } from "./local-copy.ts";
import { followPhoneNotices, sendPhoneData, startPhonePush } from "./phone-runtime.ts";
import { stopBackgroundCheck } from "./platform/background-check.ts";
import { IS_PHONE } from "./platform/device.ts";
import { clearPresentedPoolNotifications } from "./platform/notification-cleanup.ts";
import { watchServer } from "./platform/server-origin.ts";
import { serverStore } from "./platform/server-store.ts";
import { canUseCurrentServer, serverSwitchStore } from "./platform/server-switch-state.ts";
import { forgetLineDraft } from "./platform/shared-in.ts";
import { type Pool, poolOf, retryOnWindowFocus } from "./runtime-pool.ts";
import { canStartSenders, POLL_LIVE_MS, POLL_OFFLINE_MS } from "./senders.ts";
import { createZoneStep } from "./zone-after-sync.ts";

const followForeground = (runtime: PaceRuntime, pool: Pool, isActive: () => boolean) => {
  const { actions, sync } = runtime;
  const canContinue = () => isActive() && canStartSenders(runtime);
  return AppState.addEventListener("change", (next) => {
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
      if (!canContinue()) {
        return;
      }
      await pool.refresh();
      if (!canContinue()) {
        return;
      }
      await sendPhoneData(runtime);
      if (!canContinue()) {
        return;
      }
      await startPhonePush(runtime);
    })();
  });
};

type OnSynced = (owner: null | string, isSynced: boolean) => void;

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

const followConfiguration = (
  runtime: PaceRuntime,
  follow: (status: AuthState["status"]) => void,
): (() => void) => {
  const { auth, sync } = runtime;
  return serverStore.subscribe((current, previous) => {
    if (current.origin !== runtime.baseUrl) {
      return;
    }
    if (current.configurationError !== null) {
      sync.stop();
      runtime.live.stop();
      if (IS_PHONE) {
        void stopBackgroundCheck();
      }
    } else if (
      previous.origin === runtime.baseUrl &&
      previous.configurationError !== null &&
      canStartSenders(runtime)
    ) {
      follow(auth.store.getState().status);
    }
  });
};

const followRuntimeObservers = (runtime: PaceRuntime) => {
  const stopNotices = followPhoneNotices(runtime);
  const stopServerChecks = watchServer(runtime);
  const stopFocus = retryOnWindowFocus(runtime);
  return { stopNotices, stopServerChecks, stopFocus };
};

/** Retire every observer together once a durable selection awaits a cold launch. */
const stopOnServerSwitch = (dispose: () => void): (() => void) => {
  const stopHandoff = serverSwitchStore.subscribe(({ origin }) => {
    if (origin !== null) {
      dispose();
    }
  });
  if (!canUseCurrentServer()) {
    dispose();
  }
  return () => {
    stopHandoff();
    dispose();
  };
};

/** Starts/stops the sync loop with the auth status; a foreground return syncs at once. */
export const runSyncLoop = (runtime: PaceRuntime, onSynced: OnSynced): (() => void) => {
  const { auth, sync } = runtime;
  let isActive = true;
  let activeSession = runtime.api.currentSessionToken();
  const pool = poolOf(runtime);
  const zone = createZoneStep(runtime);
  const stopLanguageSync = followSyncedLanguage(runtime, zone.follow(onSynced));
  const follow = (status: AuthState["status"]): void => {
    if (status === "signed-in" && canStartSenders(runtime)) {
      activeSession = runtime.api.currentSessionToken();
      void (async () => {
        try {
          await bootstrap(runtime, {
            pool,
            session: activeSession,
            zoneSettled: zone.settled,
            isActive: () => isActive,
          });
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
  const stopConfiguration = followConfiguration(runtime, follow);
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
    const leaving = activeSession;
    activeSession = undefined;
    // The half-typed line was this account's: a share after the next sign-in is only the share.
    forgetLineDraft();
    void dropLocalCopyOnSignOut(runtime, { cause: signOutCauseOf(current), leaving });
  });
  // The poll is a safety net while the server can say "changed" itself.
  const stopFollowingLive = runtime.live.status.subscribe(({ isConnected }, previous) => {
    sync.setInterval(isConnected ? POLL_LIVE_MS : POLL_OFFLINE_MS);
    // Back on the line: what the pool got meanwhile, unless it was just fetched.
    if (isConnected && !previous.isConnected && canStartSenders(runtime) && !pool.isFresh()) {
      void pool.refresh();
    }
  });
  const subscription = followForeground(runtime, pool, () => isActive);
  const { stopNotices, stopServerChecks, stopFocus } = followRuntimeObservers(runtime);
  const dispose = (): void => {
    if (!isActive) {
      return;
    }
    isActive = false;
    stopConfiguration();
    stopFocus();
    stopServerChecks();
    unsubscribe();
    subscription.remove();
    stopNotices();
    stopLanguageSync();
    stopFollowingLive();
    sync.stop();
    runtime.live.stop();
    if (IS_PHONE && !canUseCurrentServer()) {
      void stopBackgroundCheck();
    }
  };
  return stopOnServerSwitch(dispose);
};
