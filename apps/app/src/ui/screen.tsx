import { type ReactNode, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIsScreenActive } from "./screen-active.ts";
import { useLiftToastAbove } from "./toast.tsx";

/**
A full screen on the app background below the status bar. `header` stays put; the body
scrolls, with room at the bottom for the toast. A wide window keeps it a readable column.
*/
export const Screen = ({
  children,
  fills = false,
  footer,
  header,
  scrollLabel,
}: {
  readonly children: ReactNode;
  /**
  A body that holds no control (Insights) is a stop for the keyboard under this name, so it can
  be scrolled without a mouse (axe's scrollable-region-focusable; QA round 11 L8).
  */
  readonly scrollLabel?: string;
  /**
  The body takes the height left under the header as it is, without scrolling: Week
  fits its grid into it (and scrolls the grid itself only when it cannot).
  */
  readonly fills?: boolean;
  readonly footer?: ReactNode;
  readonly header?: ReactNode;
}) => {
  const insets = useSafeAreaInsets();
  // A toast floats above the footer (the time bar) instead of covering its buttons.
  const [footerHeight, setFooterHeight] = useState(0);
  useLiftToastAbove(footer === undefined ? 0 : footerHeight, useIsScreenActive());
  return (
    <View className="flex-1 bg-app" style={{ paddingTop: insets.top }}>
      <View className="w-full max-w-content-wide flex-1 self-center">
        {header}
        {fills ? (
          <View className="flex-1">{children}</View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="pb-16"
            keyboardShouldPersistTaps="handled"
            {...(scrollLabel !== undefined && {
              "aria-label": scrollLabel,
              role: "region",
              tabIndex: 0,
            })}
          >
            {children}
          </ScrollView>
        )}
        {footer === undefined ? null : (
          <View
            onLayout={(event) => {
              setFooterHeight(event.nativeEvent.layout.height);
            }}
            testID="screen-footer"
          >
            {footer}
          </View>
        )}
      </View>
    </View>
  );
};
