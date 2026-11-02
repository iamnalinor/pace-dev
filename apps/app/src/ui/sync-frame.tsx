import { CloudOff, RefreshCw } from "lucide-react-native";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PaceRuntime } from "#app/runtime.ts";
import type { MessageKey } from "@pace/core";

import { useAuth, useIsFirstSync, useIsOffline, usePace, useT } from "#app/app-state.tsx";
import { useIsDeviceOffline } from "#app/platform/device-offline.ts";

import { Skeleton } from "./skeleton.tsx";
import { useTheme } from "./theme-provider.tsx";

/**
How long the first sync may hide the app. A pull that never answers (a stalled connection, a
proxy holding the request) would otherwise hold the whole app, Log out included (review I2).
*/
export const FIRST_SYNC_COVER_MS = 10_000;

/**
A pill floating at the top: offline while the last sync could not reach the server (what is
written stays on the device and goes out on reconnect, QA round 17 M5), or still syncing once
the first sync outlasts its cover. It floats over the page rather than sitting in the layout, so
the page never moves under the person as it comes and goes (QA round 18 L11: a line in the layout
pushed everything down 37 px mid-typing); a press goes through around it.
*/
const SyncStrip = ({ message }: { readonly message: MessageKey }) => {
  const t = useT();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const Icon = message === "errors.offline" ? CloudOff : RefreshCw;
  return (
    <View
      className="absolute left-0 right-0 top-0 z-50 items-center px-4"
      pointerEvents="box-none"
      style={{ paddingTop: insets.top + 6 }}
    >
      <View
        accessibilityLiveRegion="polite"
        className="max-w-xl flex-row items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 shadow-lg"
        role="status"
        testID="sync-strip"
      >
        <Icon aria-hidden color={palette.warn} size={16} strokeWidth={2} />
        <Text className="shrink font-sans text-[13px] text-fg">{t(message)}</Text>
        {message === "errors.offline" ? <RetryNow /> : null}
      </View>
    </View>
  );
};

/**
Tries the server again now, rather than at the end of the backoff (up to a minute after the
server is back, QA round 20 L2): the socket and a sync run, as on the way back online.
*/
const RetryNow = () => {
  const t = useT();
  const runtime = usePace();
  return (
    <Pressable
      accessibilityRole="button"
      className="active:opacity-70"
      hitSlop={12}
      onPress={() => {
        backOnline(runtime);
      }}
    >
      <Text className="font-sans text-[13px] font-medium text-fg underline">{t("sync.retry")}</Text>
    </Pressable>
  );
};

/** True once `isActive` has held for `ms` without a break; false again as soon as it stops. */
const useHasLasted = (isActive: boolean, ms: number): boolean => {
  // Each stretch of `isActive` is counted, so a timer of an earlier stretch never speaks for this one.
  const [stretch, setStretch] = useState({ count: 0, isActive });
  if (stretch.isActive !== isActive) {
    setStretch({ count: stretch.count + 1, isActive });
  }
  const [lasted, setLasted] = useState<null | number>(null);
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const timer = setTimeout(() => {
      setLasted(stretch.count);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [isActive, ms, stretch.count]);
  return isActive && lasted === stretch.count;
};

/** What the line across the top says, if anything: offline comes first. */
const stripMessage = ({
  isOffline,
  isOverdue,
}: {
  readonly isOffline: boolean;
  readonly isOverdue: boolean;
}): MessageKey | null => {
  if (isOffline) {
    return "errors.offline";
  }
  return isOverdue ? "sync.stillSyncing" : null;
};

/**
Back on the network: the sync runs at once, and the socket starts again only in a tab the person
sees. A hidden tab's socket rests (the app's visibility rule): it starts when the tab is shown.
*/
export const backOnline = ({ auth, live, sync }: PaceRuntime): void => {
  if (auth.store.getState().status !== "signed-in") {
    return;
  }
  if (AppState.currentState === "active") {
    live.stop();
    live.start();
  }
  void sync.syncNow();
};

const useIsDeviceOfflineWithReconnect = (): boolean => {
  const runtime = usePace();
  const reconnect = useCallback(() => {
    backOnline(runtime);
  }, [runtime]);
  return useIsDeviceOffline(reconnect);
};

const HIDDEN = { display: "none" } as const;

/**
Grey rows where the screen will be, under one line that says what is happening (QA round 18 M5:
a bare skeleton said nothing, and a reader heard nothing). The account's language is not known
yet, so the line is in the device's (`useT` before the first sync); no screen's own words show.
*/
const FirstSyncPlaceholder = () => {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 items-center bg-bg px-4" style={{ paddingTop: insets.top + 32 }}>
      <View className="w-full max-w-xl gap-4">
        <Text className="font-sans text-[15px] text-muted">{t("sync.firstSyncLine")}</Text>
        <Skeleton label={t("sync.firstSync")} rows={6} />
      </View>
    </View>
  );
};

/**
The app under the sync line, and covered while it waits for its first sync.

- Covered (sidebar included) while a signed-in copy that holds nothing waits for its first sync
  (QA round 17 M4): no final empty state ("Nothing to do right now") and no word in the device's
  language while the account's is not known yet. The app stays mounted, only not drawn, so no
  navigator mounts late (bug class 61).
- The cover lasts `FIRST_SYNC_COVER_MS` at most: then the app is shown under a "still syncing"
  line, usable, until that sync ends (review I2).
- The offline line while the last sync could not reach the server or the device says it has no
  network.
*/
export const SyncFrame = ({
  children,
  isBare,
}: {
  readonly children: ReactNode;
  /** Signing in and the walk-through: never covered. */
  readonly isBare: boolean;
}) => {
  const { status } = useAuth();
  const isDeviceOffline = useIsDeviceOfflineWithReconnect();
  const isOffline = useIsOffline() || (status === "signed-in" && isDeviceOffline);
  const isFirstSync = useIsFirstSync() && !isBare;
  const isOverdue = useHasLasted(isFirstSync, FIRST_SYNC_COVER_MS);
  const isCovered = isFirstSync && !isOverdue;
  const message = stripMessage({ isOffline, isOverdue });
  return (
    <View className="flex-1 bg-bg">
      {/* Out of the page while covered (not drawn, not read), yet mounted. */}
      <View className="flex-1" style={isCovered ? HIDDEN : undefined}>
        {children}
      </View>
      {isCovered ? <FirstSyncPlaceholder /> : null}
      {message === null ? null : <SyncStrip message={message} />}
    </View>
  );
};
