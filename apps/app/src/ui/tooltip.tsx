import type { ReactNode } from "react";

import { View } from "react-native";

import type { TooltipProps } from "./tooltip-props.ts";

/** A phone has no tooltips to host; the web's needs none either (its bubble goes to the body). */
export const TooltipHost = ({ children }: { readonly children: ReactNode }) => children;

/**
A short explanation of its trigger, for a pointer (spec §4.2.31). A touch shows nothing: the tap
runs the control (a bubble on tap toggled the moon and popped «Ночные часы» over the grid), and a
control whose reason matters says it in its own place (a hint line, the picker it opens). The
trigger keeps its accessible name; TalkBack reads it. The web build swaps in `tooltip.web.tsx`,
which shows on hover and on keyboard focus.
*/
export const Tooltip = ({ children, isFilling = false }: TooltipProps) => (
  // The trigger keeps the box it had inside the tooltip on every platform.
  <View {...(isFilling && { className: "flex-1" })} collapsable={false}>
    {children}
  </View>
);
