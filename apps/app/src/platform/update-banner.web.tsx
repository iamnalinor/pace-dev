import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Workbox } from "workbox-window";

import { useT } from "#app/app-state.tsx";
import { cx } from "#app/ui/cx.ts";
import { useIsWide } from "#app/ui/layout.ts";

/** How often an open tab asks the server for a newer build. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
Registers the service worker; when a new build has installed and waits, a bar at the top says
so. Reload hands control to the new worker and reloads once it has taken over.
*/
const useWaitingWorker = (): null | Workbox => {
  const [waiting, setWaiting] = useState<null | Workbox>(null);
  useEffect(() => {
    if (__DEV__ || !("serviceWorker" in navigator)) {
      return;
    }
    const workbox = new Workbox("/sw.js");
    const onWaiting = (): void => {
      setWaiting(workbox);
    };
    // Only an update reloads: the first worker taking control of a fresh visit changes nothing.
    const onControlling = (event: { readonly isUpdate?: boolean | undefined }): void => {
      if (event.isUpdate === true) {
        globalThis.location.reload();
      }
    };
    workbox.addEventListener("waiting", onWaiting);
    workbox.addEventListener("controlling", onControlling);
    void workbox.register();
    const check = (): void => {
      if (document.visibilityState === "visible") {
        void workbox.update();
      }
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      workbox.removeEventListener("waiting", onWaiting);
      workbox.removeEventListener("controlling", onControlling);
    };
  }, []);
  return waiting;
};

/**
A quiet card, not a lime bar across the header: in the sidebar's foot on a computer, at the
top on a phone. What happened, Refresh (hands control to the new worker) and Later (until the
next visit).
*/
export const UpdateBanner = () => {
  const t = useT();
  const waiting = useWaitingWorker();
  const [isDismissed, setIsDismissed] = useState(false);
  const isWide = useIsWide();
  if (waiting === null || isDismissed) {
    return null;
  }
  return (
    <View
      accessibilityLiveRegion="polite"
      // On a computer it sits in the sidebar's empty foot, over nothing; on a phone at the top.
      className={cx(
        "absolute z-50 gap-3 rounded-xl border border-line bg-raised p-4 shadow-lg",
        isWide ? "bottom-3 left-3 w-[200px]" : "left-4 right-4 top-3 mx-auto max-w-[400px]",
      )}
      role="status"
    >
      <View className="gap-1">
        <Text className="font-sans text-[14px] font-semibold text-fg">{t("update.ready")}</Text>
        <Text className="font-sans text-[13px] text-muted">{t("update.detail")}</Text>
      </View>
      <View className="flex-row flex-wrap justify-end gap-2">
        <Pressable
          accessibilityRole="button"
          className="h-9 justify-center rounded-md px-3 active:opacity-70"
          onPress={() => {
            setIsDismissed(true);
          }}
        >
          <Text className="font-sans text-[14px] text-fg2">{t("update.later")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="h-9 justify-center rounded-md bg-accent px-4 active:opacity-80"
          onPress={() => {
            waiting.messageSkipWaiting();
          }}
        >
          <Text className="font-sans text-[14px] font-medium text-accentFg">
            {t("update.reload")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};
