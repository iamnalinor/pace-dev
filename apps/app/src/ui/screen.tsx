import { type ReactNode, useState } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { space } from "@pace/core";

import { cx } from "./cx.ts";
import { useFloatPlace, useLiftToastAbove } from "./float-layer.ts";
import { useIsWide } from "./layout.ts";
import { useIsScreenActive } from "./screen-active.ts";

/** The readable column every part of a screen keeps to on a wide window (spec §4.2.18). */
const COLUMN = "w-full max-w-content-wide self-center";

/**
A screen's column on `expanded`: anchored at the region's leading edge, so its content starts at the
same x on every screen (sidebar 248 + the header's gutter 32 = 280; spec §5.0.1). `content` is 720
(Now's list), `wide` 960 (the default). Centring the 960 column put Week, Inbox, Settings and the
rest 116 px right of Now and Day (design review H1).
*/
const ANCHORED = {
  content: "w-full max-w-content self-start",
  wide: "w-full max-w-content-wide self-start",
} as const;

/**
What a screen with a virtualised body (`SectionedList`) hands its list: the column, the foot room,
the scroll edge and the test id the body of every screen has.
*/
export type ScrollerProps = {
  readonly contentContainerClassName: string;
  readonly contentContainerStyle: { readonly paddingBottom: number };
  readonly keyboardShouldPersistTaps: "handled";
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly scrollEventThrottle: number;
  readonly testID: string;
};

/** The room a list keeps under its last row (64), when nothing floats over its foot. */
const FOOT_ROOM = space["11"];

/** Whether the body has scrolled at all: content is then under the header's edge. */
const isUnder = (event: NativeSyntheticEvent<NativeScrollEvent>): boolean =>
  event.nativeEvent.contentOffset.y > 0;

/** The body under the header: the screen's own list, a body that fills, or the scroller. */
const ScreenBody = ({
  children,
  column,
  fills,
  scroller,
  scrolling,
  scrollLabel,
}: {
  readonly children: ReactNode;
  readonly column: string;
  readonly fills: boolean;
  readonly scroller: ((props: ScrollerProps) => ReactNode) | undefined;
  readonly scrolling: ScrollerProps;
  readonly scrollLabel?: string;
}) => {
  if (scroller !== undefined) {
    return <>{scroller(scrolling)}</>;
  }
  if (fills) {
    return <View className={cx(column, "flex-1")}>{children}</View>;
  }
  return (
    <ScrollView
      {...scrolling}
      className="flex-1"
      {...(scrollLabel !== undefined && {
        "aria-label": scrollLabel,
        role: "region",
        tabIndex: 0,
      })}
    >
      {children}
    </ScrollView>
  );
};

/**
A full screen on the app background below the status bar (spec §4.2.18). `header` stays put; the
body scrolls, with room at the bottom for the toast. A wide window keeps each part a readable
column, but the scroller spans the whole content region: its scrollbar sits at the region's edge
and the wheel scrolls over the gutters too (F-WEB-05).
*/
export const Screen = ({
  children,
  fills = false,
  anchor = "wide",
  footer,
  header,
  scroller,
  scrollLabel,
}: {
  readonly children?: ReactNode;
  /** A list that scrolls itself (a long, virtualised one) in place of the screen's `ScrollView`. */
  readonly scroller?: (props: ScrollerProps) => ReactNode;
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
  /** How wide the column is on a computer; it always hugs the region's leading edge (`ANCHORED`). */
  readonly anchor?: keyof typeof ANCHORED;
}) => {
  const isWide = useIsWide();
  const column = isWide ? ANCHORED[anchor] : COLUMN;
  const insets = useSafeAreaInsets();
  // A toast floats above the footer (the time bar) instead of covering its buttons.
  const [footerHeight, setFooterHeight] = useState(0);
  useLiftToastAbove(footer === undefined ? 0 : footerHeight, useIsScreenActive());
  // While a toast or the offline pill floats over the list's foot, the list scrolls that much further.
  const { inset } = useFloatPlace();
  const [isScrolled, setIsScrolled] = useState(false);
  const scrolling = {
    contentContainerClassName: column,
    contentContainerStyle: { paddingBottom: Math.max(FOOT_ROOM, inset) },
    keyboardShouldPersistTaps: "handled",
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const isNowUnder = isUnder(event);
      if (isNowUnder !== isScrolled) {
        setIsScrolled(isNowUnder);
      }
    },
    scrollEventThrottle: 16,
    testID: "screen-body",
  } as const;
  return (
    <View className="flex-1 bg-app" style={{ paddingTop: insets.top }}>
      {/*
      The scroll edge (F-LAY-13): once the content scrolls under the header, the header keeps
      the page's ground and a hairline marks its edge; at rest the line is there, unseen, so
      nothing moves when it shows.
      */}
      {header === undefined ? null : (
        <View
          className={cx("border-b bg-app", isScrolled ? "border-separator" : "border-transparent")}
          testID="screen-header-edge"
        >
          <View className={column} testID="screen-column">
            {header}
          </View>
        </View>
      )}
      <ScreenBody
        column={column}
        fills={fills}
        scroller={scroller}
        scrolling={scrolling}
        {...(scrollLabel !== undefined && { scrollLabel })}
      >
        {children}
      </ScreenBody>
      {footer === undefined ? null : (
        <View
          className={column}
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
