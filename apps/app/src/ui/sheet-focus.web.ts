import type { View } from "react-native";

import { type RefCallback, useCallback } from "react";

import { IS_TOUCH_BROWSER } from "./use-hotkey.tsx";

/** A field to type into, in the order the sheet shows them. */
const FIELDS = "input:not([disabled]):not([type=hidden]), textarea:not([disabled])";
/** Anything else Tab stops at. */
const STOPS = '[tabindex="0"], button:not([disabled]), a[href]';

/**
Where an open sheet may start, in order: its fields (only where there is a keyboard to type with:
on a touch screen a focused field brings up the on-screen keyboard over the sheet, fix round 5
V4), then its other controls but the close cross; and the sheet itself when it holds nothing
else to focus (a block's details on a phone: focus stayed on the page behind it). None when focus
is already in the sheet on something other than the cross (a field that focused itself).
*/
export const sheetStartStops = (
  surface: HTMLElement,
  {
    active,
    closeLabel,
    hasKeyboard,
  }: {
    readonly active: Element | null;
    readonly closeLabel: string;
    readonly hasKeyboard: boolean;
  },
): readonly HTMLElement[] => {
  const isClose = (element: Element): boolean => element.getAttribute("aria-label") === closeLabel;
  if (active !== null && surface.contains(active) && !isClose(active)) {
    return [];
  }
  const fields = hasKeyboard ? [...surface.querySelectorAll<HTMLElement>(FIELDS)] : [];
  const others = [...surface.querySelectorAll<HTMLElement>(STOPS)].filter(
    (element) => !isClose(element) && !element.matches(FIELDS),
  );
  const stops = [...fields, ...others];
  return stops.length > 0 ? stops : [surface];
};

/**
Focuses the first of `stops` that takes focus (a hidden one takes none: the next is tried); false
when none did, as while the modal has not shown its content yet.
*/
export const didFocusFirstOf = (
  stops: readonly HTMLElement[],
  active: () => Element | null,
): boolean =>
  stops.some((stop) => {
    stop.focus();
    return active() === stop;
  });

/** How many frames the sheet tries to take focus while the modal is still showing its content. */
const FOCUS_FRAMES = 30;

/**
Puts the keyboard on the sheet's first field once it opens (QA round 18 M1): the callback ref for
the sheet's surface. The modal's own focus trap lands on the first thing it can focus (the
click-away dim, "Close", or the trap itself), so typing went nowhere and Tab met two Close stops
before the title. The modal mounts and shows its content after the sheet, and a hidden element
takes no focus: it tries frame after frame until focus is in the sheet (or gives up).
*/
export const useSheetFocusRef = ({
  closeLabel,
}: {
  readonly closeLabel: string;
}): RefCallback<View> =>
  useCallback(
    (surface: null | View) => {
      const element = surface as unknown as HTMLElement | null;
      if (element === null) {
        return;
      }
      // Focusable by the script alone (never a Tab stop): where a sheet with nothing else starts.
      element.tabIndex = -1;
      let frame = 0;
      let left = FOCUS_FRAMES;
      const attempt = (): void => {
        const stops = sheetStartStops(element, {
          active: document.activeElement,
          closeLabel,
          hasKeyboard: !IS_TOUCH_BROWSER,
        });
        left -= 1;
        if (stops.length > 0 && !didFocusFirstOf(stops, () => document.activeElement) && left > 0) {
          frame = requestAnimationFrame(attempt);
        }
      };
      frame = requestAnimationFrame(attempt);
      return () => {
        cancelAnimationFrame(frame);
      };
    },
    [closeLabel],
  );
