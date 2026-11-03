import { View } from "react-native";

import { cx } from "./cx.ts";
import { fillClass, type TagColor, tintClass } from "./hue.ts";
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
      "min-h-5 min-w-0 shrink flex-row items-center self-start rounded-pill px-2",
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
An 8 px dot in the hue's stroke (≥ 3:1 on the grounds): a project before its name in a picker or
a chip, the running activity's category (static: the live time is the motion, spec §6), a legend.
Decorative: the name beside it is the text.
*/
export const Dot = ({ hue }: { readonly hue: TagColor }) => (
  <View className={cx("size-2 shrink-0 rounded-pill", fillClass(hue))} testID="dot" />
);
