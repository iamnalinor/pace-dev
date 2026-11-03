import { View } from "react-native";

import { Inspector, type ShellProps, useShellInsets } from "./shell-regions.tsx";

export type { ShellProps } from "./shell-regions.tsx";

/**
The app's one shell (spec §3.3, §5.0.1): navigation · content · inspector. The inspector exists
only on an `expanded` window and only while something is selected; a `medium` or `compact` window
shows the selection in a sheet instead, so the shell draws no pane there. The web build swaps in
`shell.web.tsx`, which adds the `main` landmark and the skip link.
*/
export const Shell = ({ content, navigation, ...inspector }: ShellProps) => {
  const insets = useShellInsets();
  return (
    <View className="flex-1 flex-row bg-app" style={insets} testID="shell">
      {navigation}
      <View className="min-w-0 flex-1" testID="shell-content">
        {content}
      </View>
      <Inspector {...inspector} />
    </View>
  );
};
