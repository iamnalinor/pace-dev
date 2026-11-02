import type { ReactNode } from "react";

import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { cx } from "./cx.ts";
import { useTheme } from "./theme-provider.tsx";

/**
The header from the Main artboard: a mono eyebrow, a 30px title and an optional action. On a
narrow screen the actions go under the title instead of past the edge. A screen pushed over the
tabs (Settings through More) adds a back chevron before the title.
*/
export const ScreenHeader = ({
  backLabel,
  eyebrow,
  onBack,
  right,
  title,
}: {
  readonly backLabel?: string;
  readonly eyebrow?: string;
  /** Without it there is no back chevron (a tab, or a top-level screen beside the sidebar). */
  readonly onBack?: () => void;
  readonly right?: ReactNode;
  readonly title: string;
}) => {
  const { palette } = useTheme();
  return (
    <View
      className={cx(
        "flex-row flex-wrap items-end justify-between gap-x-3 gap-y-2 pb-3 pr-5 pt-6",
        onBack === undefined ? "pl-5" : "pl-2",
      )}
    >
      <View className="flex-row items-end gap-1">
        {onBack === undefined ? null : (
          <Pressable
            accessibilityLabel={backLabel}
            accessibilityRole="button"
            className="h-hit-web w-hit-web items-center justify-center active:opacity-70"
            onPress={onBack}
          >
            <ChevronLeft color={palette["label.secondary"]} size={20} strokeWidth={1.75} />
          </Pressable>
        )}
        <View>
          {eyebrow === undefined ? null : (
            <Text className="font-sans text-caption2 font-normal uppercase tabular-nums text-label-tertiary">
              {eyebrow}
            </Text>
          )}
          <Text
            accessibilityRole="header"
            className="mt-1 font-sans text-largeTitle font-semibold text-label-primary"
          >
            {title}
          </Text>
        </View>
      </View>
      {right}
    </View>
  );
};
