import { View } from "react-native";

import { type Importance, IMPORTANCE_COLORS, type ProjectColorName } from "@pace/core";

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

/** A thin coloured edge at the start of a row; transparent for Normal so rows stay aligned. */
export const ImportanceEdge = ({ importance }: { readonly importance: Importance }) => {
  const color = IMPORTANCE_COLORS[importance];
  return (
    <View
      className={cx(
        "w-[3px] self-stretch rounded-full",
        color === null ? "bg-transparent" : FILL[color],
      )}
    />
  );
};
