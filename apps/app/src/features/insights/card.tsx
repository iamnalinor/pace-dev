import type { ReactNode } from "react";

import { Text, View } from "react-native";

/** One Insights card: a header and its content, named for screen readers. */
export const Card = ({
  children,
  title,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <View
    accessibilityLabel={title}
    className="gap-3 rounded-xl border border-line bg-surface p-4"
    role="group"
  >
    <Text accessibilityRole="header" className="font-sans text-[14px] font-medium text-fg">
      {title}
    </Text>
    {children}
  </View>
);
