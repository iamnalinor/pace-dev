import { type ReactNode, useRef } from "react";
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
        {footer}
      </View>
    </View>
  );
};
