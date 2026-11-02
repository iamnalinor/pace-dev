import { createContext, type ReactNode, use, useMemo } from "react";
import { View } from "react-native";

import type { ThemeName } from "@pace/core";

import {
  type Palette,
  paletteOf,
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

/**
Resolves the device preference and defines the `--pace-*` variables on the root view. `forced`
draws a subtree in one scheme whatever the device says (the dev gallery's `theme` param).
*/
export const ThemeProvider = ({
  children,
  forced,
}: {
  readonly children: ReactNode;
  readonly forced?: ThemeName;
}) => {
  const { preference, scheme: preferred, setPreference } = useThemePreference();
  const scheme = forced ?? preferred;
  const theme = useMemo<Theme>(
    () => ({ palette: paletteOf(scheme), preference, scheme, setPreference }),
    [preference, scheme, setPreference],
  );
  return (
    <ThemeContext value={theme}>
      <View className="flex-1 bg-app" style={paletteVars(scheme)}>
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
