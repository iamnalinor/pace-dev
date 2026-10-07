import { View } from "react-native";

import { type Importance, IMPORTANCE_COLORS } from "@pace/core";

import { cx } from "./cx.ts";
import { PROJECT_FILL } from "./dot.tsx";

/** A thin coloured edge at the start of a row; transparent for Normal so rows stay aligned. */
export const ImportanceEdge = ({ importance }: { readonly importance: Importance }) => {
  const color = IMPORTANCE_COLORS[importance];
  return (
    <View
      className={cx(
        "w-[3px] self-stretch rounded-full",
        color === null ? "bg-transparent" : PROJECT_FILL[color],
      )}
    />
  );
};
