import type { View } from "react-native";

import { type RefCallback, useCallback } from "react";

/** A field to type into, in the order the sheet shows them. */
const FIELDS = "input:not([disabled]):not([type=hidden]), textarea:not([disabled])";
/** Anything else Tab stops at. */
const STOPS = '[tabindex="0"], button:not([disabled]), a[href]';

/**
The element an open sheet starts on: its first field (a form's title, a picker's search), else
its first control that is not the close cross; `null` when focus is already in the sheet on
something other than the cross (a field that focused itself).
*/
const firstStop = (surface: HTMLElement, closeLabel: string): HTMLElement | null => {
  const active = document.activeElement;
  const isClose = (element: Element): boolean => element.getAttribute("aria-label") === closeLabel;
  return active !== null && surface.contains(active) && !isClose(active)
    ? null
    : (surface.querySelector<HTMLElement>(FIELDS) ??
        [...surface.querySelectorAll<HTMLElement>(STOPS)].find((element) => !isClose(element)) ??
        null);
};

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
      let frame = 0;
      let left = FOCUS_FRAMES;
      const attempt = (): void => {
        const stop = firstStop(element, closeLabel);
        stop?.focus();
        left -= 1;
        if (stop !== null && document.activeElement !== stop && left > 0) {
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
