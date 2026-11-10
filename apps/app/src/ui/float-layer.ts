import type { LayoutChangeEvent } from "react-native";

import { createContext, use, useCallback, useEffect, useId, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { layout, space } from "@pace/core";

/** A part of the bottom chrome or of the stack over it that tells the layer its height. */
type Publish = (key: string, height: null | number) => void;

/** Where the content region is across the window (the sidebar or the rail beside it). */
type Region = { readonly x: number; readonly width: number };

/** What the parts of the app tell the layer: each speaks for itself, by its own key. */
export type Publishers = {
  readonly setFooter: Publish;
  readonly setTabBar: Publish;
  readonly setStatus: Publish;
  readonly setRegion: (region: null | Region) => void;
  /** The width of the column the screen in front keeps to on a wide window (720 or 960). */
  readonly setColumn: Publish;
};

const NOBODY: Publishers = {
  setColumn: () => undefined,
  setFooter: () => undefined,
  setRegion: () => undefined,
  setStatus: () => undefined,
  setTabBar: () => undefined,
};

export const PublishersContext = createContext<Publishers>(NOBODY);

/**
Where the bottom stack (the offline pill, then the toast above it) floats: `bottom` clears the
measured bottom chrome (tab bar, screen footer, the safe area) by `space.3`; `left` and `right`
keep it inside the content region, never across the sidebar or the rail (R23-13a), and on a wide
window inside the screen's own column, which hugs the region's leading edge: centred on the whole
region it floated beside the column, unattached (QA PR55-1-14, bug-lessons 342). `inset` is
how much of the content's foot the stack covers right now: a list scrolls that far further.
*/
export type FloatPlace = {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly inset: number;
};

/** Air between the bottom chrome and what floats over it (spec §4.1.4 rule 3). */
export const CHROME_GAP = space["3"];
/** Air between the offline pill and a toast stacked over it. */
const STACK_GAP = space["3"];
/** The stack keeps this far from the content region's sides (the compact gutter). */
const SIDE_GAP = layout.gutter.phone;

export const PlaceContext = createContext<FloatPlace>({
  bottom: CHROME_GAP,
  inset: 0,
  left: SIDE_GAP,
  right: SIDE_GAP,
});

/** Heights by who published them; a part that goes away takes its height with it. */
const useHeights = () => {
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const publish = useCallback<Publish>((key, height) => {
    setHeights(({ [key]: _gone, ...others }) =>
      height === null ? others : { ...others, [key]: height },
    );
  }, []);
  return { publish, tallest: Math.max(0, ...Object.values(heights)) };
};

/** Publishes `height` under a key of its own while `isActive`; takes it back when it stops. */
const usePublish = (
  pick: (publishers: Publishers) => Publish,
  height: number,
  isActive: boolean,
) => {
  const publish = pick(use(PublishersContext));
  const publisherId = useId();
  useEffect(() => {
    if (!isActive) {
      return;
    }
    publish(publisherId, height);
    return () => {
      publish(publisherId, null);
    };
  }, [height, isActive, publisherId, publish]);
};

/**
Keeps the toast above this screen's footer (the time bar) while the screen is the one in front.
A screen under a pushed one or a tab left behind stays mounted, and must not lift the toast of
the next one.
*/
export const useLiftToastAbove = (footerHeight: number, isActive: boolean): void => {
  usePublish((publishers) => publishers.setFooter, footerHeight, isActive);
};

/**
The phone's tab bar tells the layer its measured height (insets included) while it is on screen:
the toast and the pill float above it, never at a guessed constant (F-CMP-12).
*/
export const usePublishTabBar = (height: number, isShown: boolean): void => {
  usePublish((publishers) => publishers.setTabBar, height, isShown && height > 0);
};

/** The offline pill's height, so a toast stacks above it instead of over its Retry (review #6). */
export const usePublishStatus = (height: number): void => {
  usePublish((publishers) => publishers.setStatus, height, height > 0);
};

/**
The screen in front tells the layer how wide its column is on a wide window (`layout.contentMax` or
`contentMaxWide`), so what floats is centred over the column the person reads, not over the empty
room to its right. Nothing while it is not in front, or on a window where the column is the region.
*/
export const usePublishColumn = (width: number, isActive: boolean): void => {
  usePublish((publishers) => publishers.setColumn, width, isActive && width > 0);
};

/**
The shell's content region tells the layer where it is across the window: what floats is centred
in it, clear of the sidebar and the rail. Answers the region's `onLayout`; a shell that does not
publish (a nested one) leaves the root's word standing.
*/
export const useContentRegionLayout = (
  isPublishing: boolean,
): ((event: LayoutChangeEvent) => void) => {
  const { setRegion } = use(PublishersContext);
  useEffect(() => {
    if (!isPublishing) {
      return;
    }
    return () => {
      setRegion(null);
    };
  }, [isPublishing, setRegion]);
  return useCallback(
    (event: LayoutChangeEvent) => {
      const { width, x } = event.nativeEvent.layout;
      setRegion({ width, x });
    },
    [setRegion],
  );
};

/** Where the bottom stack floats: the offline pill sits at `bottom`; a toast stacks over it. */
export const useFloatPlace = (): FloatPlace => use(PlaceContext);

/**
The layer's own state, for the toast's provider: what the parts published, and from it where the
stack floats. `toast` is the toast's measured height while one shows (null while none does).
*/
export const useFloatLayer = ({
  areaWidth,
  toast,
}: {
  readonly areaWidth: number;
  readonly toast: null | number;
}) => {
  const insets = useSafeAreaInsets();
  const footers = useHeights();
  const tabBars = useHeights();
  const statuses = useHeights();
  const columns = useHeights();
  const [region, setRegion] = useState<null | Region>(null);
  const publishers = useMemo<Publishers>(
    () => ({
      setColumn: columns.publish,
      setFooter: footers.publish,
      setRegion,
      setStatus: statuses.publish,
      setTabBar: tabBars.publish,
    }),
    [columns.publish, footers.publish, statuses.publish, tabBars.publish],
  );
  // The column's trailing edge: the region's, or the column's where it is narrower.
  const column = columns.tallest > 0 ? columns.tallest : Infinity;
  const columnRight = region === null ? null : region.x + Math.min(region.width, column);
  const chromeBottom = Math.max(tabBars.tallest, insets.bottom) + footers.tallest + CHROME_GAP;
  const statusLift = statuses.tallest > 0 ? statuses.tallest + STACK_GAP : 0;
  // What the stack covers of the content's foot: the gap under it, the stack, air above it.
  const stack = statusLift + (toast ?? 0);
  const place = useMemo<FloatPlace>(
    () => ({
      bottom: chromeBottom,
      inset: stack > 0 ? stack + 2 * CHROME_GAP : 0,
      left: (region?.x ?? 0) + SIDE_GAP,
      right: columnRight === null ? SIDE_GAP : areaWidth - columnRight + SIDE_GAP,
    }),
    [areaWidth, chromeBottom, columnRight, region, stack],
  );
  return { place, publishers, toastBottom: chromeBottom + statusLift };
};
