import type { RefObject } from "react";
import type { View } from "react-native";

import { isFocusLost } from "./move-focus.ts";

/** The control a place offers the keyboard: its first button or checkbox, else the place itself. */
const focusInside = (element: HTMLElement): void => {
  const control = element.querySelector<HTMLElement>('[role="checkbox"], [role="button"], button');
  if (control === null) {
    element.setAttribute("tabindex", "-1");
    element.focus();
  } else {
    control.focus();
  }
};

/**
After an editor in place closes (Escape, Cancel, Save), keyboard focus goes to the place it stood
in, a frame later once the field is gone and only where nothing else took it: the control there
(«Add description», the description's own button), else the place itself, so the next Tab goes on
from there and not from the top of the page (QA round 25 R25-09, bug class 5).
*/
export const focusPlace = (place: RefObject<null | View>): void => {
  requestAnimationFrame(() => {
    const element = place.current as unknown as HTMLElement | null;
    if (element === null || !isFocusLost()) {
      return;
    }
    const control = element.querySelector<HTMLElement>('[role="button"], button');
    if (control === null) {
      element.tabIndex = -1;
      element.focus();
    } else {
      control.focus();
    }
  });
};

/** How long a closing editor may take to leave (its exit animation) before the wait gives up. */
const CLOSING_FRAMES = 90;

/**
After an editor that no control opened closes (one the address opened, Week's «Edit in Day»),
keyboard focus goes to the row it edited, named by its `nativeID`, once the editor has gone (a
pane or a sheet stays through its exit animation, focus still inside it), and only where nothing
else took it (QA R27-09: it fell to the page). Focus the person moves meanwhile stays.
*/
export const focusPlaceById = (id: string): void => {
  const holder = document.activeElement;
  const wait = (frames: number): void => {
    requestAnimationFrame(() => {
      if (isFocusLost()) {
        const element = document.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        if (element !== null) {
          focusInside(element);
        }
      } else if (document.activeElement === holder && frames > 0) {
        wait(frames - 1);
      }
    });
  };
  wait(CLOSING_FRAMES);
};

/**
Where the focused row of a list stands, read before it leaves: its list, its place in it, the row
itself (to wait for it to go), and the heading the list stands under (for when none is left).
*/
export type RowPlace = null | {
  readonly list: HTMLElement;
  readonly index: number;
  readonly item: HTMLElement;
  readonly heading: HTMLElement | null;
};

const itemsOf = (list: HTMLElement): readonly HTMLElement[] =>
  [...list.querySelectorAll<HTMLElement>('[role="listitem"]')].filter(
    (item) => item.closest('[role="list"]') === list,
  );

const isAfter = (from: Node, other: Node): boolean =>
  (from.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** The last heading before the list on the page: the one it stands under. */
const headingOf = (list: HTMLElement): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>('[role="heading"], h1, h2, h3, h4, h5, h6')].findLast(
    (heading) => !list.contains(heading) && isAfter(heading, list),
  ) ?? null;

const FOCUSABLE =
  'button, a[href], input, textarea, select, [role="button"], [role="checkbox"], [tabindex]:not([tabindex="-1"])';

/** The heading's neighbour: the first control after it on the page, else the heading itself. */
const focusAfterHeading = (heading: HTMLElement): void => {
  const neighbour = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].find((control) =>
    isAfter(heading, control),
  );
  if (neighbour === undefined) {
    heading.setAttribute("tabindex", "-1");
    heading.focus();
  } else {
    neighbour.focus();
  }
};

export const focusedRowPlace = (): RowPlace => {
  const active = document.activeElement;
  const item = active === null ? null : active.closest<HTMLElement>('[role="listitem"]');
  const list = item === null ? null : item.closest<HTMLElement>('[role="list"]');
  return item === null || list === null
    ? null
    : { heading: headingOf(list), index: itemsOf(list).indexOf(item), item, list };
};

/** How many frames a checked row may take to leave before the wait gives up (a refused close). */
const LEAVING_FRAMES = 30;

/** Focus where the row stood: the row that took its place, the last one, or the heading's neighbour. */
const focusInPlace = (place: NonNullable<RowPlace>): void => {
  const items = place.list.isConnected ? itemsOf(place.list) : [];
  const next = items[Math.min(place.index, items.length - 1)];
  if (next !== undefined) {
    focusInside(next);
  } else if (place.heading?.isConnected === true) {
    focusAfterHeading(place.heading);
  }
};

/**
A row that held focus left its list (checked off): focus goes to the row that took its place, the
last one when it was last, the list's heading's neighbour when none is left, never to the top of
the page (QA PR55-1-10, class 375). It waits for the row to go (a few frames, as `focusPlaceById`
does), and only where nothing else took focus meanwhile.
*/
export const focusRowPlace = (place: RowPlace): void => {
  if (place === null) {
    return;
  }
  const holder = document.activeElement;
  const wait = (frames: number): void => {
    requestAnimationFrame(() => {
      // Focus the person moved meanwhile stays.
      if (document.activeElement !== holder && !isFocusLost()) {
        return;
      }
      if (place.item.isConnected) {
        if (frames > 0) {
          wait(frames - 1);
        }
        return;
      }
      if (isFocusLost()) {
        focusInPlace(place);
      }
    });
  };
  wait(LEAVING_FRAMES);
};
