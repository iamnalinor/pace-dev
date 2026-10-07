import { createContext, type ReactNode, use, useMemo } from "react";
import { View } from "react-native";

import { type Palette, type ThemeName, tokens } from "@pace/core";

import {
  paletteVars,
  type ThemePreference,
  type ThemePreferenceHandle,
  useThemePreference,
} from "../platform/theme.ts";

export type Theme = {
  readonly scheme: ThemeName;
  /** Resolved token values, for props that take a colour (icons, native controls). */
  readonly palette: Palette;
  readonly preference: ThemePreference;
  readonly setPreference: ThemePreferenceHandle["setPreference"];
};

const ThemeContext = createContext<null | Theme>(null);

/** Resolves the device preference and defines the `--pace-*` variables on the root view. */
export const ThemeProvider = ({ children }: { readonly children: ReactNode }) => {
  const { preference, scheme, setPreference } = useThemePreference();
  const theme = useMemo<Theme>(
    () => ({ palette: tokens[scheme], preference, scheme, setPreference }),
    [preference, scheme, setPreference],
  );
  return (
    <ThemeContext value={theme}>
      <View className="flex-1 bg-bg" style={paletteVars(scheme)}>
        {children}
      </View>
    </ThemeContext>
  );
};

export const useTheme = (): Theme => {
  const theme = use(ThemeContext);
  if (theme === null) {
    throw new Error("useTheme needs a ThemeProvider above it");
  }
  return theme;
};
