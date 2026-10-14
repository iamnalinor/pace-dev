import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { Workbox } from "workbox-window";

import { useT } from "#app/app-state.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

/** How often an open tab asks the server for a newer build. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/** The strip's slide: long enough to see where it came from, short enough not to wait for it. */
const SLIDE_MS = 300;

const CLIP = { overflow: "hidden" } as const;

/**
Registers the service worker; when a new build has installed and waits, a strip at the
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
The notice: a quiet blue strip across the top of the page, one centred row with what happened and
the one thing to do (there is no "later", so it stays until the page is refreshed). It sits in
the layout above the app, not over it: it grows from nothing, so the whole app slides down
instead of being covered. It takes the phone's top safe area itself (the web app installed to a
home screen draws under the status bar); reduced motion makes it appear at once.
*/
export const UpdateStrip = ({ onRefresh }: { readonly onRefresh: () => void }) => {
  const t = useT();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [isHovered, setIsHovered] = useState(false);
  const height = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ height: height.get() }));
  return (
    <Animated.View style={[CLIP, style]}>
      <View
        accessibilityLiveRegion="polite"
        className="flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1.5 bg-accentQuiet px-4 py-2.5"
        onLayout={(event) => {
          height.set(
            withTiming(event.nativeEvent.layout.height, {
              duration: SLIDE_MS,
              reduceMotion: ReduceMotion.System,
            }),
          );
        }}
        role="status"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Text className="shrink text-center font-sans text-sm text-accentQuietFg">
          {t("update.message")}
        </Text>
        <Pressable
          accessibilityRole="button"
          className="rounded-md border px-3 py-1 active:opacity-80"
          onHoverIn={() => {
            setIsHovered(true);
          }}
          onHoverOut={() => {
            setIsHovered(false);
          }}
          onPress={onRefresh}
          style={{
            // Outlined in the strip's own foreground at 40%, washed at 10% under the pointer.
            backgroundColor: isHovered ? `${palette.accentQuietFg}1a` : "transparent",
            borderColor: `${palette.accentQuietFg}66`,
          }}
        >
          <Text className="font-sans text-sm font-medium text-accentQuietFg">
            {t("update.refresh")}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};

/**
The strip above the app, and the app under it. While it is open the strip has taken the top
safe area, so the screens are told there is none left (they pad themselves with it).
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
    <View className="flex-1 bg-bg">
      {isOpen ? <UpdateStrip onRefresh={onRefresh} /> : null}
      <SafeAreaInsetsContext value={below}>{children}</SafeAreaInsetsContext>
    </View>
  );
};

/** Wraps the app: once a new build waits, the strip slides down above it; Refresh hands control to the new worker, which reloads the page. */
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
