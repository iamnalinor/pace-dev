import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Workbox } from "workbox-window";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { Presence } from "#app/ui/presence.tsx";
import { Text } from "#app/ui/text.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { shadow, space, z } from "@pace/core";

/** How often an open tab asks the server for a newer build. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
Registers the service worker; when a new build has installed and waits, a card at the
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
The notice (spec §7 "Update banner", F-WEB-07): a compact card over the top of the page, with what
happened and the one thing to do (there is no "later", so it stays until the page is refreshed). It
lies over the app and pushes nothing: the screen under it keeps its layout, so a tap aimed at a row
never lands on a row that has just moved. It rises 8 px and fades in (`Presence`; a fade alone under
reduced motion) and keeps clear of the phone's status bar itself. A reload loses no typing: drafts
are kept on the device (`platform/drafts.ts`), so Refresh needs no "save your draft first".
*/
export const UpdateCard = ({ onRefresh }: { readonly onRefresh: () => void }) => {
  const t = useT();
  const { scheme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      className="absolute inset-x-0 top-0 items-center px-gutter"
      pointerEvents="box-none"
      style={{ paddingTop: insets.top + space["2"], zIndex: z.toast }}
    >
      <Presence enter="rise" initial show>
        <View
          accessibilityLiveRegion="polite"
          aria-live="polite"
          className="max-w-toast-max flex-row flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg bg-elevated py-2 pl-4 pr-2"
          role="status"
          style={{ boxShadow: shadow(scheme, "overlay") }}
          testID="update-card"
        >
          <Text className="shrink" role="subhead">
            {t("update.message")}
          </Text>
          <Button onPress={onRefresh} variant="secondary">
            {t("update.refresh")}
          </Button>
        </View>
      </Presence>
    </View>
  );
};

/** The app, and the card over it while a new build waits. */
export const UpdateFrame = ({
  children,
  isOpen,
  onRefresh,
}: {
  readonly children: ReactNode;
  readonly isOpen: boolean;
  readonly onRefresh: () => void;
}) => (
  <View className="flex-1 bg-app">
    {children}
    {isOpen ? <UpdateCard onRefresh={onRefresh} /> : null}
  </View>
);

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
