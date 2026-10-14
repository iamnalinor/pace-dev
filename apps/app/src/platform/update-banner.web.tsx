import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Workbox } from "workbox-window";

import { useT } from "#app/app-state.tsx";
import { cx } from "#app/ui/cx.ts";
import { useIsWide } from "#app/ui/layout.ts";

/** How often an open tab asks the server for a newer build. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
Registers the service worker; when a new build has installed and waits, a card says
so. Refresh hands control to the new worker and reloads once it has taken over.
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
A compact rectangle, not a lime bar across the header: one row with what happened and the one
thing to do, short enough to fit the sidebar's width. On a computer it sits in the sidebar's
foot, where it covers nothing (there is no "later", so it stays until the page is refreshed);
on a phone it is at the top.
*/
export const UpdateCard = ({
  isWide,
  onRefresh,
}: {
  readonly isWide: boolean;
  readonly onRefresh: () => void;
}) => {
  const t = useT();
  return (
    <View
      accessibilityLiveRegion="polite"
      className={cx(
        "absolute z-50 flex-row items-center justify-between gap-1.5 rounded-xl border border-line bg-raised py-1.5 pl-3 pr-1.5 shadow-lg",
        isWide ? "bottom-3 left-2 w-[207px]" : "left-4 right-4 top-3 max-w-[400px] self-center",
      )}
      role="status"
    >
      <Text className="shrink font-sans text-[13px] font-medium text-fg" numberOfLines={1}>
        {t("update.ready")}
      </Text>
      <Pressable
        accessibilityRole="button"
        className="h-8 justify-center rounded-md bg-accent px-2 active:opacity-80"
        onPress={onRefresh}
      >
        <Text className="font-sans text-[13px] font-medium text-accentFg">
          {t("update.reload")}
        </Text>
      </Pressable>
    </View>
  );
};

/** The card, once a new build waits; Refresh hands control to the new worker, which reloads the page. */
export const UpdateBanner = () => {
  const waiting = useWaitingWorker();
  const isWide = useIsWide();
  if (waiting === null) {
    return null;
  }
  return (
    <UpdateCard
      isWide={isWide}
      onRefresh={() => {
        waiting.messageSkipWaiting();
      }}
    />
  );
};
