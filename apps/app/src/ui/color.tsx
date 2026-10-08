import { Text, View } from "react-native";

import type { ProjectColorName } from "@pace/core";

import { cx } from "./cx.ts";

/*
Static class names: NativeWind only compiles the classes it can read in the source. A
colored thing is a tag: a light wash of the color under text in its `ink-*` shade, which
the token contrast test keeps at 4.5:1 in both themes.
*/
export const PROJECT_FILL: Readonly<Record<ProjectColorName, string>> = {
  amber: "bg-project-amber",
  blue: "bg-project-blue",
  coral: "bg-project-coral",
  green: "bg-project-green",
  orange: "bg-project-orange",
  pink: "bg-project-pink",
  slate: "bg-project-slate",
  teal: "bg-project-teal",
  violet: "bg-project-violet",
  yellow: "bg-project-yellow",
};

const WASH: Readonly<Record<ProjectColorName, string>> = {
  amber: "bg-project-amber/16",
  blue: "bg-project-blue/16",
  coral: "bg-project-coral/16",
  green: "bg-project-green/16",
  orange: "bg-project-orange/16",
  pink: "bg-project-pink/16",
  slate: "bg-project-slate/16",
  teal: "bg-project-teal/16",
  violet: "bg-project-violet/16",
  yellow: "bg-project-yellow/16",
};

const EDGE: Readonly<Record<ProjectColorName, string>> = {
  amber: "border-project-amber/45",
  blue: "border-project-blue/45",
  coral: "border-project-coral/45",
  green: "border-project-green/45",
  orange: "border-project-orange/45",
  pink: "border-project-pink/45",
  slate: "border-project-slate/45",
  teal: "border-project-teal/45",
  violet: "border-project-violet/45",
  yellow: "border-project-yellow/45",
};

/** A full-strength outline in the color: an unselected chip of that color. */
export const OUTLINE: Readonly<Record<ProjectColorName, string>> = {
  amber: "border-project-amber",
  blue: "border-project-blue",
  coral: "border-project-coral",
  green: "border-project-green",
  orange: "border-project-orange",
  pink: "border-project-pink",
  slate: "border-project-slate",
  teal: "border-project-teal",
  violet: "border-project-violet",
  yellow: "border-project-yellow",
};

export const INK: Readonly<Record<ProjectColorName, string>> = {
  amber: "text-ink-amber",
  blue: "text-ink-blue",
  coral: "text-ink-coral",
  green: "text-ink-green",
  orange: "text-ink-orange",
  pink: "text-ink-pink",
  slate: "text-ink-slate",
  teal: "text-ink-teal",
  violet: "text-ink-violet",
  yellow: "text-ink-yellow",
};

/** A washed container in the color (soft border included); neutral without a color. */
export const washClass = (color: null | ProjectColorName): string =>
  color === null ? "bg-raised" : `${WASH[color]} ${EDGE[color]}`;

/** The text color on a wash; neutral without a color. */
export const inkClass = (color: null | ProjectColorName): string =>
  color === null ? "text-fg2" : INK[color];

/** A name in its color: a project, a category, an importance. */
export const ColorTag = ({
  children,
  color,
}: {
  readonly color: null | ProjectColorName;
  readonly children: string;
}) => (
  <View
    className={cx("self-start rounded-sm px-1.5 py-px", color === null ? "bg-raised" : WASH[color])}
  >
    <Text
      className={cx("font-sans text-[11px] font-medium leading-4", inkClass(color))}
      numberOfLines={1}
    >
      {children}
    </Text>
  </View>
);
