import type { ReactNode } from "react";

import { ScrollView, Text, View } from "react-native";

/** A labelled, horizontally scrolling row of one-tap options (a radio group). */
export const OptionRow = ({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) => (
  <View className="gap-1.5">
    <Text className="font-sans text-[12px] text-muted">{label}</Text>
    <ScrollView
      accessibilityLabel={label}
      contentContainerClassName="gap-1.5"
      horizontal
      keyboardShouldPersistTaps="handled"
      role="radiogroup"
      showsHorizontalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  </View>
);
