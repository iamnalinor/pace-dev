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
  <View className="gap-2">
    <Text className="font-sans text-caption font-normal text-label-tertiary">{label}</Text>
    <View accessibilityLabel={label} className="flex-row flex-wrap gap-2" role="radiogroup">
      {children}
    </View>
  </View>
);
