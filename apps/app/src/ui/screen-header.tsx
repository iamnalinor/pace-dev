import type { ReactNode } from "react";

import { Text, View } from "react-native";

/**
The header from the Main artboard: a mono eyebrow, a 30px title and an optional action. On a
narrow screen the actions go under the title instead of past the edge.
*/
export const ScreenHeader = ({
  eyebrow,
  right,
  title,
}: {
  readonly eyebrow?: string;
  readonly right?: ReactNode;
  readonly title: string;
}) => (
  <View className="flex-row flex-wrap items-end justify-between gap-x-3 gap-y-2 px-5 pb-3 pt-6">
    <View>
      {eyebrow === undefined ? null : (
        <Text className="font-sans text-[11px] uppercase tabular-nums tracking-[0.06em] text-muted">
          {eyebrow}
        </Text>
      )}
      <Text
        accessibilityRole="header"
        className="mt-1 font-sans text-[30px] font-semibold tracking-tight text-fg"
      >
        {title}
      </Text>
    </View>
    {right}
  </View>
);
