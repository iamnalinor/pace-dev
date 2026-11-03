import type { ReactNode } from "react";

import { View } from "react-native";

import { useLanguage } from "#app/app-state.tsx";
import { formatCount } from "@pace/core";

import { cx } from "./cx.ts";
import { Text, type TextProps } from "./text.tsx";

/**
A section's heading over a `Group` (spec §4.1.1, §5.0.3): `subhead` in the secondary label, in
sentence case as written (never upper-cased: no eyebrow, F-TYP-02), 24 above and 8 below, inset to
the cell text (`row.padX` inside the gutter). A heading of `level` 2 on a screen, 3 inside a pane
(F-A11Y-05). It may carry a count (`formatCount`, tabular) or one action at its trailing end.
*/
export const SectionHeader = ({
  action,
  count,
  inset = true,
  level = 2,
  title,
}: {
  readonly title: string;
  readonly level?: 2 | 3;
  /** How many the section holds; never with `action` (one trailing thing). */
  readonly count?: number | undefined;
  readonly action?: ReactNode;
  /** Inside the screen's gutter, over an inset `Group` (the default); off over a flush one. */
  readonly inset?: boolean;
}) => {
  const language = useLanguage();
  const heading: TextProps = { level, role: "subhead", tone: "secondary" };
  return (
    <View
      className={cx("mb-2 mt-6 min-h-6 flex-row items-end gap-3 px-row-x", inset && "mx-gutter")}
    >
      <Text {...heading} className="flex-1">
        {title}
      </Text>
      {count === undefined ? null : (
        <Text role="numeric.value" tone="secondary">
          {formatCount(count, language)}
        </Text>
      )}
      {action}
    </View>
  );
};
