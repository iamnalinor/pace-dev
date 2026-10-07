import * as SecureStore from "expo-secure-store";
import { vars } from "nativewind";
import { useCallback, useEffect, useState } from "react";
import { type ColorSchemeName, useColorScheme } from "react-native";

import { type PaletteName, type ThemeName, tokens } from "@pace/core";

/** Per-device theme preference; `system` follows the OS appearance. */
export type ThemePreference = "dark" | "light" | "system";

const PREFERENCE_KEY = "pace.theme";

const PREFERENCES: ReadonlySet<ThemePreference> = new Set(["dark", "light", "system"]);

const isPreference = (value: null | string): value is ThemePreference =>
  PREFERENCES.has(value as ThemePreference);

/** Reads the stored preference; anything unreadable counts as `system`. */
export const loadThemePreference = async (): Promise<ThemePreference> => {
  try {
    const stored = await SecureStore.getItemAsync(PREFERENCE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
};

export const saveThemePreference = async (preference: ThemePreference): Promise<void> => {
  await SecureStore.setItemAsync(PREFERENCE_KEY, preference);
};

/** The scheme to draw with: an explicit preference wins, otherwise the OS one (dark unless light). */
export const resolveScheme = (
  preference: ThemePreference,
  systemScheme: ColorSchemeName | undefined,
): ThemeName => {
  if (preference !== "system") {
    return preference;
  }
  return systemScheme === "light" ? "light" : "dark";
};

/** `--pace-<token>` CSS variables for one palette, as `tailwind.config.js` expects them. */
export const paletteVariables = (scheme: ThemeName): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(tokens[scheme]).map(([name, value]) => [`--pace-${name as PaletteName}`, value]),
  );

/** The NativeWind `vars()` style for the root view; every `bg-*`/`text-*` class resolves through it. */
export const paletteVars = (scheme: ThemeName): ReturnType<typeof vars> =>
  vars(paletteVariables(scheme));

export type ThemePreferenceHandle = {
  readonly preference: ThemePreference;
  readonly scheme: ThemeName;
  readonly setPreference: (next: ThemePreference) => void;
};

/** The stored preference resolved against the OS scheme; `setPreference` applies and persists it. */
export const useThemePreference = (): ThemePreferenceHandle => {
  const systemScheme = useColorScheme();
  const [stored, setStored] = useState<ThemePreference>("system");

  useEffect(() => {
    const lifetime = new AbortController();
    void (async () => {
      const loaded = await loadThemePreference();
      if (!lifetime.signal.aborted) {
        setStored(loaded);
      }
    })();
    return () => {
      lifetime.abort();
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setStored(next);
    void saveThemePreference(next);
  }, []);

  return { preference: stored, scheme: resolveScheme(stored, systemScheme), setPreference };
};
