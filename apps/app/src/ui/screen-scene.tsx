import type { ReactNode } from "react";

import { useIsFocused } from "expo-router";

import { ScreenActiveContext } from "./screen-active.ts";

/** A navigator's screen: tells what is inside whether it is the screen in front. */
export const ScreenScene = ({ children }: { readonly children: ReactNode }) => (
  <ScreenActiveContext value={useIsFocused()}>{children}</ScreenActiveContext>
);
