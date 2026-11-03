import { type ReactNode, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cx } from "./cx.ts";
import { useIsScreenActive } from "./screen-active.ts";
import { useLiftToastAbove } from "./toast.tsx";

/** The readable column every part of a screen keeps to on a wide window (spec §4.2.18). */
const COLUMN = "w-full max-w-content-wide self-center";

/**
A full screen on the app background below the status bar (spec §4.2.18). `header` stays put; the
body scrolls, with room at the bottom for the toast. A wide window keeps each part a readable
column, but the scroller spans the whole content region: its scrollbar sits at the region's edge
and the wheel scrolls over the gutters too (F-WEB-05).
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
      <View className={COLUMN}>{header}</View>
      {fills ? (
        <View className={cx(COLUMN, "flex-1")}>{children}</View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName={cx(COLUMN, "pb-16")}
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
          className={COLUMN}
          onLayout={(event) => {
            setFooterHeight(event.nativeEvent.layout.height);
          }}
          testID="screen-footer"
        >
          {footer}
        </View>
      )}
    </View>
  );
};
