import type { ReactNode } from "react";

import { Text, View } from "react-native";

/** The header from the Main artboard: a mono eyebrow, a 30px title and an optional action. */
export const ScreenHeader = ({
  eyebrow,
  right,
  title,
}: {
  readonly eyebrow?: string;
  readonly right?: ReactNode;
  readonly title: string;
}) => (
  <View className="flex-row items-end justify-between px-5 pb-3 pt-6">
    <View>
      {eyebrow === undefined ? null : (
        <Text className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          {eyebrow}
        </Text>
      )}
      <Text className="mt-1 font-sans text-[30px] font-semibold tracking-tight text-fg">
        {title}
      </Text>
    </View>
    {right}
  </View>
);
