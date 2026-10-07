import { View } from "react-native";

import type { ProjectColorName } from "@pace/core";

import { cx } from "./cx.ts";

/** Static class names: NativeWind only compiles the classes it can read in the source. */
const FILL: Readonly<Record<ProjectColorName, string>> = {
  amber: "bg-project-amber",
  blue: "bg-project-blue",
  coral: "bg-project-coral",
  green: "bg-project-green",
  pink: "bg-project-pink",
  slate: "bg-project-slate",
  teal: "bg-project-teal",
  violet: "bg-project-violet",
};

/** The 7px project dot of the Now rows and chips; `square` is the 12px project-title mark. */
export const Dot = ({
  color,
  square = false,
}: {
  readonly color: null | ProjectColorName;
  readonly square?: boolean;
}) => (
  <View
    className={cx(
      square ? "h-3 w-3 rounded-[4px]" : "h-[7px] w-[7px] rounded-full",
      color === null ? "bg-faint" : FILL[color],
    )}
  />
);
