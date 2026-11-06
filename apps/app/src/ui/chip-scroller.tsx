import { type ReactNode, useRef, useState } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from "react-native";

import { cx } from "./cx.ts";
import { Icon } from "./icon.tsx";
import { useWheelScroll } from "./use-wheel-scroll.ts";

/** How far a row has scrolled and how much room it has, from which the cues are known. */
type Metrics = { readonly content: number; readonly view: number; readonly x: number };

/** Whether more of the row lies past each end (a pixel of slack for fractional widths). */
export const edgesOf = ({
  content,
  view,
  x,
}: Metrics): { readonly hasEnd: boolean; readonly hasStart: boolean } => ({
  hasEnd: x + view < content - 1,
  hasStart: x > 1,
});

/** The cue at an end of the row: a chevron on the page's ground, drawn over the clipped chip. */
const Cue = ({ side }: { readonly side: "end" | "start" }) => (
  <View
    accessibilityElementsHidden
    className={cx(
      "absolute inset-y-0 w-6 items-center justify-center bg-app",
      side === "start" ? "left-0" : "right-0",
    )}
    importantForAccessibility="no-hide-descendants"
    pointerEvents="none"
    testID={`chip-scroller-cue-${side}`}
  >
    <Icon
      name={side === "start" ? "chevron-left" : "chevron-right"}
      size="inline"
      tone="tertiary"
    />
  </View>
);

/**
A row of chips that scrolls sideways (the project filter): a chevron at each end that has more
beyond it says the row goes on, and on a computer the mouse wheel moves it (F-DAT-02, F-DAT-05-006).
*/
export const ChipScroller = ({ children }: { readonly children: ReactNode }) => {
  const scrollerRef = useRef<ScrollView>(null);
  const [metrics, setMetrics] = useState<Metrics>({ content: 0, view: 0, x: 0 });
  useWheelScroll(scrollerRef);
  const { hasEnd, hasStart } = edgesOf(metrics);
  return (
    <View
      onLayout={(event) => {
        const view = event.nativeEvent.layout.width;
        setMetrics((current) => ({ ...current, view }));
      }}
      testID="chip-scroller"
    >
      <ScrollView
        horizontal
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const x = event.nativeEvent.contentOffset.x;
          setMetrics((current) => ({ ...current, x }));
        }}
        ref={scrollerRef}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
      >
        <View
          className="px-gutter"
          onLayout={(event) => {
            const content = event.nativeEvent.layout.width;
            setMetrics((current) => ({ ...current, content }));
          }}
          testID="chip-scroller-content"
        >
          {children}
        </View>
      </ScrollView>
      {hasStart ? <Cue side="start" /> : null}
      {hasEnd ? <Cue side="end" /> : null}
    </View>
  );
};
