import { useEffect } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useStore } from "zustand";

import { useAuth, useLanguage, usePace, useSync } from "#app/app-state.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

import { paceNative } from "../../modules/pace-native/index.ts";
import { crashContextOf } from "./crash-context.ts";

const reactNativeVersion = (): string => {
  const { major, minor, patch } = Platform.constants.reactNativeVersion;
  return `${major}.${minor}.${patch}`;
};

/** Keeps the native crash catcher told what the app is doing, for the next crash file. */
export const useCrashContext = (route: string): void => {
  const { status } = useAuth();
  const language = useLanguage();
  const { scheme } = useTheme();
  const { status: sync } = useSync();
  const { isConnected } = useStore(usePace().live.status);
  const { fontScale, height, width } = useWindowDimensions();
  const text = crashContextOf({
    engine: "HermesInternal" in globalThis ? "hermes" : "other engine",
    language,
    liveConnected: isConnected,
    reactNative: reactNativeVersion(),
    route,
    signedIn: status === "signed-in",
    sync,
    theme: scheme,
    window: { fontScale, height: Math.round(height), width: Math.round(width) },
  });
  useEffect(() => {
    paceNative.setCrashContext(text);
  }, [text]);
};
