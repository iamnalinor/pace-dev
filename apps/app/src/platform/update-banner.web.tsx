import { type ReactNode, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { Workbox } from "workbox-window";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { Collapse } from "#app/ui/disclosure.tsx";
import { Text } from "#app/ui/text.tsx";
import { space } from "@pace/core";

/** How often an open tab asks the server for a newer build. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
Registers the service worker; when a new build has installed and waits, a strip across the
top of the page says so. Refresh hands control to the new worker and reloads once it has taken over.
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
The notice (spec §7 "Update banner", F-WEB-07): a quiet accent strip across the top of the page,
one centred row with what happened and the one thing to do (there is no "later", so it stays until
the page is refreshed). It sits in the layout above the app, not over it: it grows from nothing
(`Collapse`, the disclosure's motion; at once under reduced motion), so the app slides down and
nothing (Back, a title, a header action) is covered. A tap aimed at a row cannot land on a moved row
in practice: the strip comes at most once per build and grows over the disclosure's duration. It
takes the phone's top safe area itself (the installed app draws under the status bar). A reload
loses no typing: drafts are kept on the device (`platform/drafts.ts`).
*/
export const UpdateStrip = ({ onRefresh }: { readonly onRefresh: () => void }) => {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityLiveRegion="polite"
      aria-live="polite"
      className="flex-row flex-wrap items-center justify-center gap-x-3 bg-accent-quiet px-gutter pb-1"
      role="status"
      style={{ paddingTop: insets.top + space["1"] }}
      testID="update-strip"
    >
      <Text className="shrink text-center" role="subhead">
        {t("update.message")}
      </Text>
      <Button onPress={onRefresh} size="small" variant="plain">
        {t("update.refresh")}
      </Button>
    </View>
  );
};

/**
The strip above the app, and the app under it. While it is open the strip has taken the top safe
area, so the screens are told there is none left (they pad themselves with it).
*/
export const UpdateFrame = ({
  children,
  isOpen,
  onRefresh,
}: {
  readonly children: ReactNode;
  readonly isOpen: boolean;
  readonly onRefresh: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const below = useMemo(() => (isOpen ? { ...insets, top: 0 } : insets), [insets, isOpen]);
  return (
    <View className="flex-1 bg-app">
      <Collapse open={isOpen}>{isOpen ? <UpdateStrip onRefresh={onRefresh} /> : null}</Collapse>
      <View className="flex-1">
        <SafeAreaInsetsContext value={below}>{children}</SafeAreaInsetsContext>
      </View>
    </View>
  );
};

/** Wraps the app: once a new build waits, the card shows over it; Refresh hands control to the new worker, which reloads the page. */
export const UpdateBanner = ({ children }: { readonly children: ReactNode }) => {
  const waiting = useWaitingWorker();
  return (
    <UpdateFrame
      isOpen={waiting !== null}
      onRefresh={() => {
        waiting?.messageSkipWaiting();
      }}
    >
      {children}
    </UpdateFrame>
  );
};
