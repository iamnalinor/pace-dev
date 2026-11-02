import type { ReactNode } from "react";

import { View } from "react-native";

/**
A wide window's two panes: the main one (a list, a grid) takes the room that is left, and the
side one shows what was picked in it, at a reading width, a hairline between them. On a phone
the screens show the side content in a sheet instead.
*/
export const SplitPane = ({
  main,
  side,
  sideLabel,
}: {
  readonly main: ReactNode;
  readonly side: ReactNode;
  /** What the side pane holds, for screen readers ("Details"). */
  readonly sideLabel: string;
}) => (
  <View className="flex-1 flex-row bg-app">
    <View className="min-w-0 flex-1 border-r border-separator">{main}</View>
    <View accessibilityLabel={sideLabel} className="w-inspector max-w-2/5" role="region">
      {side}
    </View>
  </View>
);
