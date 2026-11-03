import type { ReactNode } from "react";

import { View } from "react-native";

import { useLanguage } from "#app/app-state.tsx";
import { formatCount } from "@pace/core";

import { cx } from "./cx.ts";
import { Text } from "./text.tsx";

/** What the badge counts: things waiting for the person (danger), or unread things (neutral). */
export type CountTone = "danger" | "neutral";

/** The most a badge spells out; past it, "99+" (spec §4.2.8). */
const MAX = 99;

/**
A small pill with a number, hugging its digits (never narrower than its height). `danger` is the
solid red margin with cell-coloured digits, for what waits (the Inbox); `neutral` is a quiet fill
with secondary digits, for what is merely unread (spec §4.2.8). `caption2` is the floor of the
type scale and chrome (font scale capped at 1.6). Hidden at zero; the host names the count in its
own accessibility label (a control's name stands in for its content on both platforms).
*/
export const CountBadge = ({
  count,
  tone = "danger",
}: {
  readonly count: number;
  readonly tone?: CountTone;
}) => {
  const language = useLanguage();
  return count <= 0 ? null : (
    <View
      className={cx(
        "h-5 min-w-5 items-center justify-center rounded-pill px-2",
        tone === "danger" ? "bg-danger" : "bg-fill-3",
      )}
      testID="count-badge"
    >
      <Text
        chrome
        className="font-semibold"
        numeric
        role="caption2"
        tone={tone === "danger" ? "onDanger" : "secondary"}
      >
        {count > MAX ? `${String(MAX)}+` : formatCount(count, language)}
      </Text>
    </View>
  );
};

/** The badge's leading edge on the icon's trailing edge (a percentage: no token for it). */
const AT_TRAILING_EDGE = { left: "100%" } as const;

/**
An icon with its count on the glyph's top-right corner (spec §4.2.8 Placement, F-DAT-10): the
badge's leading edge sits on the icon's trailing edge and it grows away from the icon (to the
right in a left-to-right layout), never back over the glyph; its middle is at the icon's top.
The bell, the Inbox tab and the rail use it; a sidebar row puts the badge in its trailing slot.
*/
export const BadgeAnchor = ({
  children,
  count,
  tone,
}: {
  readonly children: ReactNode;
  readonly count: number;
  readonly tone: CountTone;
}) => (
  <View className="relative">
    {children}
    <View className="absolute -top-2 -ml-1" style={AT_TRAILING_EDGE} testID="badge-anchor">
      <CountBadge count={count} tone={tone} />
    </View>
  </View>
);
