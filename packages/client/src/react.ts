/** React bindings for @pace/client (works in React DOM and React Native). */
import { useStore } from "zustand";

import type { Language, Settings } from "@pace/core";

import type { AppState, AppStateHandle } from "./state.ts";

export { useStore } from "zustand";

export type AppHooks = {
  readonly useAppState: <T>(selector: (state: AppState) => T) => T;
  readonly useSettings: () => Settings;
  readonly useLanguage: () => Language;
};

/** Hooks bound to one app state, so screens never pass the store around. */
export const createAppHooks = (state: AppStateHandle): AppHooks => ({
  useAppState: (selector) => useStore(state.store, selector),
  useLanguage: () => useStore(state.store, (current) => current.settings.language),
  useSettings: () => useStore(state.store, (current) => current.settings),
});
