import type { ReactNode } from "react";

import { View } from "react-native";

import { useIsWide } from "./layout.ts";

export type ShellProps = {
  /** The navigation region (`Navigation`: sidebar, rail or nothing); left out by a nested shell. */
  readonly navigation?: ReactNode;
  readonly content: ReactNode;
  /** The detail of what is selected (Now, Week, Inbox); shown beside the content on `expanded`. */
  readonly inspector?: ReactNode;
  /** Whether something is selected: closed, the content keeps the whole width (F-LAY-03). */
  readonly inspectorOpen?: boolean;
  /** What the inspector holds, for screen readers ("Details"). */
  readonly inspectorLabel?: string;
};

/**
The inspector region (spec §4.2.25): at the trailing edge at `inspector.width` (360–480), a
`separator` on its leading edge, a labelled region. Only on an `expanded` window and only while
something is selected; elsewhere the selection opens in a sheet, so nothing is drawn.
*/
export const Inspector = ({
  inspector,
  inspectorLabel,
  inspectorOpen = false,
}: Pick<ShellProps, "inspector" | "inspectorLabel" | "inspectorOpen">) => {
  const isWide = useIsWide();
  return inspectorOpen && inspector !== undefined && isWide ? (
    <View
      accessibilityLabel={inspectorLabel}
      className="w-inspector min-w-inspector-min max-w-inspector-max border-l border-separator bg-app"
      role="region"
    >
      {inspector}
    </View>
  ) : null;
};
