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

/** Runs `step` once the frame after next has drawn: the row or editor that went is gone by then. */
const afterRemoval = (step: () => void): void => {
  requestAnimationFrame(() => {
    requestAnimationFrame(step);
  });
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

/** Where the focused row of a list stands: its list and its place in it, read before it leaves. */
export type RowPlace = null | { readonly list: HTMLElement; readonly index: number };

const itemsOf = (list: HTMLElement): readonly HTMLElement[] =>
  [...list.querySelectorAll<HTMLElement>('[role="listitem"]')].filter(
    (item) => item.closest('[role="list"]') === list,
  );

export const focusedRowPlace = (): RowPlace => {
  const active = document.activeElement;
  const item = active === null ? null : active.closest<HTMLElement>('[role="listitem"]');
  const list = item === null ? null : item.closest<HTMLElement>('[role="list"]');
  return item === null || list === null ? null : { index: itemsOf(list).indexOf(item), list };
};

/**
A row that held focus left its list (checked off): focus goes to the row that took its place, the
last one when it was last, the list's heading's neighbour when none is left, never to the top of
the page (QA PR55-1-10).
*/
export const focusRowPlace = (place: RowPlace): void => {
  if (place === null) {
    return;
  }
  afterRemoval(() => {
    if (!isFocusLost()) {
      return;
    }
    const items = place.list.isConnected ? itemsOf(place.list) : [];
    const next = items[Math.min(place.index, items.length - 1)];
    if (next !== undefined) {
      focusInside(next);
    }
  });
};
