import { useCallback, useSyncExternalStore } from "react";

export type ThemePreference = "dark" | "light" | "system";

export const THEME_KEY = "pace.theme";

const THEMES: readonly ThemePreference[] = ["system", "light", "dark"];

const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === "string" && (THEMES as readonly string[]).includes(value);

/** The per-device theme choice; `system` when nothing valid is stored or storage is blocked. */
export const readThemePreference = (): ThemePreference => {
  try {
    const stored: unknown = localStorage.getItem(THEME_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
};

/** Components showing the preference (settings control, toaster) re-render through this. */
const listeners = new Set<() => void>();

/** What a private window remembers for this page load when localStorage is blocked. */
const memory: { fallback: ThemePreference | undefined } = { fallback: undefined };

export const setThemePreference = (preference: ThemePreference): void => {
  try {
    if (preference === "system") {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, preference);
    }
    memory.fallback = undefined;
  } catch {
    memory.fallback = preference;
  }
  for (const notify of listeners) {
    notify();
  }
};

const currentPreference = (): ThemePreference => memory.fallback ?? readThemePreference();

/**
 * Sets `<html data-theme>` so the token stylesheet picks the palette; `system` removes
 * the attribute and lets `prefers-color-scheme` decide. Call before the first render.
 */
export const applyTheme = (preference: ThemePreference = currentPreference()): void => {
  const root = document.documentElement;
  if (preference === "system") {
    delete root.dataset["theme"];
    return;
  }
  root.dataset["theme"] = preference;
};

const subscribe = (notify: () => void): (() => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

/** The current preference and a setter that persists it, applies it and updates every subscriber. */
export const useThemePreference = (): readonly [
  ThemePreference,
  (preference: ThemePreference) => void,
] => {
  const preference = useSyncExternalStore(
    subscribe,
    currentPreference,
    (): ThemePreference => "system",
  );
  const update = useCallback((next: ThemePreference) => {
    setThemePreference(next);
    applyTheme(next);
  }, []);
  return [preference, update];
};
