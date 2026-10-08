import { View } from "react-native";

import { type Importance, IMPORTANCE_COLORS } from "@pace/core";

import { PROJECT_FILL } from "./color.tsx";
import { cx } from "./cx.ts";

/** A coloured edge at the start of a row; transparent for Normal so rows stay aligned. */
export const ImportanceEdge = ({ importance }: { readonly importance: Importance }) => {
  const color = IMPORTANCE_COLORS[importance];
  return (
    <View
      className={cx(
        "w-1 self-stretch rounded-full",
        color === null ? "bg-transparent" : PROJECT_FILL[color],
      )}
    />
  );
};
