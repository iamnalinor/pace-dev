import type { ReactNode } from "react";

import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
A full screen on the app background below the status bar. `header` stays put; the body
scrolls, with room at the bottom for the toast. A wide window keeps it a readable column.
*/
export const Screen = ({
  children,
  footer,
  header,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly header?: ReactNode;
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="w-full max-w-[880px] flex-1 self-center">
        {header}
        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-24"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer}
      </View>
    </View>
  );
};
