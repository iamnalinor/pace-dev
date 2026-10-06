import { useCallback, useState } from "react";

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

export const setThemePreference = (preference: ThemePreference): void => {
  try {
    if (preference === "system") {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, preference);
    }
  } catch {
    // Private window or blocked storage: the choice lives for this page load only.
  }
};

/**
 * Sets `<html data-theme>` so the token stylesheet picks the palette; `system` removes
 * the attribute and lets `prefers-color-scheme` decide. Call before the first render.
 */
export const applyTheme = (preference: ThemePreference = readThemePreference()): void => {
  const root = document.documentElement;
  if (preference === "system") {
    delete root.dataset["theme"];
    return;
  }
  root.dataset["theme"] = preference;
};

/** The current preference and a setter that persists and applies it. */
export const useThemePreference = (): readonly [
  ThemePreference,
  (preference: ThemePreference) => void,
] => {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);
  const update = useCallback((next: ThemePreference) => {
    setThemePreference(next);
    applyTheme(next);
    setPreference(next);
  }, []);
  return [preference, update];
};
