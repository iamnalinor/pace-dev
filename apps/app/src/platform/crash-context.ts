import { useEffect } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useStore } from "zustand";

import type { SyncStatus } from "@pace/client";
import type { Language, ThemeName } from "@pace/core";

import { useAuth, useLanguage, usePace, useSync } from "#app/app-state.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

import { paceNative } from "../../modules/pace-native/index.ts";

/** What the app was doing, as a crash file keeps it next to the device's state. */
export type CrashContextInput = {
  readonly route: string;
  readonly signedIn: boolean;
  readonly language: Language;
  readonly theme: ThemeName;
  readonly sync: SyncStatus;
  readonly liveConnected: boolean;
  readonly reactNative: string;
  readonly engine: string;
  readonly window: { readonly width: number; readonly height: number; readonly fontScale: number };
};

/** Route names are lowercase words, groups in parentheses; anything else names a record. */
const ROUTE_NAME = /^(?:\([a-z-]+\)|[a-z][a-z-]*)$/u;
/** A ULID anywhere in a text (event, task and device ids). */
const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/giu;
const ERROR_CHARS = 160;

/** The screen's path with every record id as `:id`: which screen, never which task. */
export const maskRoute = (path: string): string =>
  path
    .split("/")
    .map((segment) => (segment === "" || ROUTE_NAME.test(segment) ? segment : ":id"))
    .join("/");

const syncLine = ({ lastError, lastSyncAt, online, syncing }: SyncStatus): string => {
  const error =
    lastError === null
      ? "no error"
      : `error: ${lastError.replaceAll(ULID, ":id").slice(0, ERROR_CHARS)}`;
  const last = lastSyncAt === null ? "never synced" : `last ${lastSyncAt}`;
  return `${online ? "online" : "offline"}, ${syncing ? "syncing" : "idle"}, ${last}, ${error}`;
};

/**
The app's side of a crash file: which screen, whether signed in, settings that change what is
drawn, the sync's state and the JS runtime. Nothing a person typed or owns: no names, tasks,
ids, calendar or app usage.
*/
export const crashContextOf = (input: CrashContextInput): string =>
  [
    `screen: ${maskRoute(input.route)}`,
    `signed in: ${input.signedIn ? "yes" : "no"}`,
    `language: ${input.language} · theme: ${input.theme}`,
    `sync: ${syncLine(input.sync)} · live channel: ${input.liveConnected ? "up" : "down"}`,
    `React Native ${input.reactNative} · ${input.engine}`,
    `window: ${input.window.width}×${input.window.height} dp, font scale ${input.window.fontScale}`,
  ].join("\n");

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
