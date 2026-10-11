import type { ReactNode } from "react";

import { useIsFocused } from "expo-router";
import { View } from "react-native";

import { ScreenActiveContext } from "./screen-active.ts";

const HIDDEN = { display: "none" } as const;
const SHOWN = { flex: 1 } as const;

/**
A navigator's screen on the web: a screen that is not in front (a tab left behind, a screen
under a pushed one) is taken out of the page, so its fields and buttons are not reachable by
Tab or a screen reader while hidden, and its shortcuts are silent.
*/
export const ScreenScene = ({ children }: { readonly children: ReactNode }) => {
  const isFocused = useIsFocused();
  return (
    <ScreenActiveContext value={isFocused}>
      <View style={isFocused ? SHOWN : HIDDEN}>{children}</View>
    </ScreenActiveContext>
  );
};
