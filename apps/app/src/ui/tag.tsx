import { View } from "react-native";

import { cx } from "./cx.ts";
import { type TagColor, tintClass } from "./hue.ts";
import { Icon, type IconName } from "./icon.tsx";
import { Text } from "./text.tsx";

/**
A name in its colour, in a row or a card (spec §4.2.7): a 20 pill, the hue's tint under its ink
(direction A: a project tag is tint and ink), `fill.4` under the secondary label without a hue.
A name from data never pushes its row: the tag yields and its text ends in "…" (the web's `title`
keeps the whole name; F-DAT-02, bug-lessons 109). Not interactive; a tappable project is a row.
*/
export const Tag = ({
  children,
  hue,
}: {
  readonly children: string;
  readonly hue: null | TagColor;
}) => (
  <View
    className={cx(
      "min-h-5 min-w-0 max-w-full shrink flex-row items-center self-start rounded-pill px-2",
      hue === null ? "bg-fill-4" : tintClass(hue),
    )}
    testID="tag"
  >
    {hue === null ? (
      <Text policy="truncate" role="caption" tone="secondary">
        {children}
      </Text>
    ) : (
      <Text hue={hue} policy="truncate" role="caption">
        {children}
      </Text>
    )}
  </View>
);

/**
A coloured thing's leading mark in a row (a project, a category, a running activity): a 32 tile in
the hue's tint with an icon in its ink. Owner 2026-11-08: a dot's colour cannot be told, so colour
is never shown as a dot. Decorative: the name beside it is the text.
*/
export const HueTile = ({
  hue,
  icon,
}: {
  /** `null`: no colour (a neutral `fill.4` tile, "No project"). */
  readonly hue: null | TagColor;
  readonly icon: IconName;
}) => (
  <View
    className={cx(
      "size-8 shrink-0 items-center justify-center rounded-md",
      hue === null ? "bg-fill-4" : tintClass(hue),
    )}
    testID="hue-tile"
  >
    <Icon hue={hue ?? undefined} name={icon} size="inline" />
  </View>
);
