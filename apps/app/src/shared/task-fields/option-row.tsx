import type { ReactNode } from "react";

import { Text, View } from "react-native";

/** A labelled group of one-tap options (a radio group) that wraps instead of hiding its end. */
export const OptionRow = ({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) => (
  <View className="gap-1.5">
    <Text className="font-sans text-[12px] text-muted">{label}</Text>
    <View accessibilityLabel={label} className="flex-row flex-wrap gap-1.5" role="radiogroup">
      {children}
    </View>
  </View>
);
