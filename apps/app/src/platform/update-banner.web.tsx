import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Workbox } from "workbox-window";

import { useT } from "#app/app-state.tsx";

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

export const UpdateBanner = () => {
  const t = useT();
  const waiting = useWaitingWorker();
  if (waiting === null) {
    return null;
  }
  return (
    <View
      accessibilityLiveRegion="polite"
      className="absolute inset-x-0 top-0 z-50 flex-row items-center justify-center gap-3 bg-accent px-4 py-2"
    >
      <Text className="font-sans text-[14px] font-medium text-accentFg">{t("update.ready")}</Text>
      <Pressable
        accessibilityRole="button"
        className="rounded-md border border-accentFg px-3 py-1 active:opacity-70"
        onPress={() => {
          waiting.messageSkipWaiting();
        }}
      >
        <Text className="font-sans text-[14px] font-semibold text-accentFg">
          {t("update.reload")}
        </Text>
      </Pressable>
    </View>
  );
};
