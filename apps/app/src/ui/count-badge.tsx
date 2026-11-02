import { Text, View } from "react-native";

import { useLanguage } from "#app/app-state.tsx";
import { formatCount } from "@pace/core";

import { cx } from "./cx.ts";

/** What the badge counts: things waiting for the person (danger), or unread things (neutral). */
export type CountTone = "danger" | "neutral";

/**
A small pill with a number, hugging its digits (never narrower than its height). `danger` is the
solid red margin with cell-coloured digits, for what waits (the Inbox); `neutral` is a quiet fill
with secondary digits, for what is merely unread (spec §4.2.8). Hidden at zero; the host names the
count in its own accessibility label.
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
        className={cx(
          "font-sans text-caption2 font-medium tabular-nums",
          tone === "danger" ? "text-cell" : "text-label-secondary",
        )}
      >
        {count > 99 ? "99+" : formatCount(count, language)}
      </Text>
    </View>
  );
};
