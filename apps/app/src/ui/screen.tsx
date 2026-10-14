import { type ReactNode, useRef, useState } from "react";
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
  footer,
  header,
  scrollTo,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly header?: ReactNode;
  /** Opens scrolled this far down (Week opens at the current hour); again when it changes. */
  readonly scrollTo?: number;
}) => {
  const insets = useSafeAreaInsets();
  const scrollerRef = useRef<ScrollView>(null);
  const scrolledToRef = useRef<number | undefined>(undefined);
  // A toast floats above the footer (the time bar) instead of covering its buttons.
  const [footerHeight, setFooterHeight] = useState(0);
  useLiftToastAbove(footer === undefined ? 0 : footerHeight, useIsScreenActive());
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="w-full max-w-[880px] flex-1 self-center">
        {header}
        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-24"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            // The calendar arriving can move the grid's first hour: the target moves with it.
            if (scrollTo === undefined || scrolledToRef.current === scrollTo) {
              return;
            }
            scrolledToRef.current = scrollTo;
            scrollerRef.current?.scrollTo({ animated: false, y: scrollTo });
          }}
          ref={scrollerRef}
        >
          {children}
        </ScrollView>
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
