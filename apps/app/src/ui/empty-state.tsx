import type { ReactNode } from "react";

import { Text, View } from "react-native";

/** Centered hint for screens with nothing to show yet. */
export const EmptyState = ({
  children,
  icon,
}: {
  readonly children: string;
  readonly icon?: ReactNode;
}) => (
  <View className="flex-1 items-center justify-center gap-3 px-10">
    {icon}
    <Text className="text-center font-sans text-[14px] leading-5 text-muted">{children}</Text>
  </View>
);
