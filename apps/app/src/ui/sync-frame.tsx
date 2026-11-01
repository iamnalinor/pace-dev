import { type ReactNode, useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth, useIsFirstSync, useIsOffline, usePace, useT } from "#app/app-state.tsx";
import { useIsDeviceOffline } from "#app/platform/device-offline.ts";

import { Skeleton } from "./skeleton.tsx";

/**
A quiet line across the top while the last sync could not reach the server: what is written
stays on the device and goes out on reconnect (QA round 17 M5). It sits in the layout, above the
app, so it covers nothing; it takes the top safe area itself.
*/
const OfflineStrip = () => {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityLiveRegion="polite"
      className="border-b border-line bg-surface px-4 pb-2"
      role="status"
      style={{ paddingTop: insets.top + 8 }}
    >
      <Text className="text-center font-sans text-sm text-muted">{t("errors.offline")}</Text>
    </View>
  );
};

/**
The app under the offline strip: shown when the last sync could not reach the server or the
device says it has no network; back on the network, the socket and the sync start again at once.
*/
export const OfflineFrame = ({ children }: { readonly children: ReactNode }) => {
  const { live, sync } = usePace();
  const { auth, status } = useAuth();
  const reconnect = useCallback(() => {
    if (auth.store.getState().status !== "signed-in") {
      return;
    }
    live.stop();
    live.start();
    void sync.syncNow();
  }, [auth, live, sync]);
  const isDeviceOffline = useIsDeviceOffline(reconnect);
  const isOffline = useIsOffline() || (status === "signed-in" && isDeviceOffline);
  const insets = useSafeAreaInsets();
  const below = useMemo(() => (isOffline ? { ...insets, top: 0 } : insets), [insets, isOffline]);
  return (
    <View className="flex-1 bg-bg">
      {isOffline ? <OfflineStrip /> : null}
      <SafeAreaInsetsContext value={below}>{children}</SafeAreaInsetsContext>
    </View>
  );
};

const HIDDEN = { display: "none" } as const;

/** Grey rows where the screen will be, with no words in either language yet. */
const FirstSyncPlaceholder = () => {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 items-center bg-bg px-4" style={{ paddingTop: insets.top + 32 }}>
      <View className="w-full max-w-xl">
        <Skeleton label={t("sync.firstSync")} rows={6} />
      </View>
    </View>
  );
};

/**
Stands in for the app (sidebar included) while a signed-in copy that holds nothing waits for its
first sync (QA round 17 M4): no final empty state ("Nothing to do right now") and no word in the
device's language while the account's is not known yet. The app stays mounted, only not drawn,
so no navigator mounts late (bug class 57).
*/
export const FirstSyncCover = ({
  children,
  isBare,
}: {
  readonly children: ReactNode;
  /** Signing in and the walk-through: never covered. */
  readonly isBare: boolean;
}) => {
  const isCovered = useIsFirstSync() && !isBare;
  return (
    <View className="flex-1">
      {/* Out of the page while covered (not drawn, not read), yet mounted. */}
      <View className="flex-1" style={isCovered ? HIDDEN : undefined}>
        {children}
      </View>
      {isCovered ? <FirstSyncPlaceholder /> : null}
    </View>
  );
};
