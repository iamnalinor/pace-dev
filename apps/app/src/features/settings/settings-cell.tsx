import type { ReactNode } from "react";

import { View } from "react-native";

/** The body of one cell of a Settings group: the row's padding around a control or a block. */
export const SettingsCell = ({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) => (
  <View accessibilityLabel={label} className="gap-2 px-row-x py-3" role="group">
    {children}
  </View>
);
