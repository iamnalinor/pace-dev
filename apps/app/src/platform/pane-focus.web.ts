import type { View } from "react-native";

import { type RefObject, useEffect, useRef } from "react";

/** The part of an element the pane's focus moves read and call (testable without a browser). */
export type FocusNode = {
  readonly contains: (other: FocusNode | null) => boolean;
  readonly focus: (options?: { readonly preventScroll?: boolean }) => void;
  readonly isConnected?: boolean;
  readonly setAttribute?: (name: string, value: string) => void;
};

/**
The pane just opened: it takes the keyboard's focus (by the script only, never a Tab stop of its
own), so the next Tab goes into it and a screen reader reads its label, unless a field in it has
taken the focus already. Returns the control that had the focus outside it: the one to give it
back to.
*/
export const focusPaneOnOpen = (pane: FocusNode, active: FocusNode | null): FocusNode | null => {
  if (active !== null && pane.contains(active)) {
    // A field in the pane took the focus as it mounted: it stays there.
    return null;
  }
  pane.setAttribute?.("tabindex", "-1");
  pane.focus({ preventScroll: true });
  return active;
};

/**
The pane is closing: when the focus was in it (or nowhere, its control gone), it goes back to the
opener, if that is still on the page; focus the person put elsewhere stays there.
*/
export const focusOpenerOnClose = (
  pane: FocusNode,
  {
    active,
    body,
    opener,
  }: {
    readonly active: FocusNode | null;
    readonly body: FocusNode | null;
    readonly opener: FocusNode | null;
  },
): void => {
  if (opener === null || opener.isConnected === false) {
    return;
  }
  const isLost = active === null || active === body || active.isConnected === false;
  if (isLost || pane.contains(active)) {
    opener.focus({ preventScroll: true });
  }
};

/**
A pane beside the content (the shell's inspector, UI review I4): focus moves into it as it opens
and back to the control that opened it (the latest one outside it that had the focus: picking
another row while it is open makes that row the opener) as it closes.
*/
export const usePaneFocus = (paneRef: RefObject<null | View>, isShown: boolean): void => {
  const openerRef = useRef<FocusNode | null>(null);
  useEffect(() => {
    const pane = paneRef.current as unknown as FocusNode | null;
    if (!isShown || pane === null || typeof document === "undefined") {
      return;
    }
    const active = (): FocusNode | null => document.activeElement as FocusNode | null;
    openerRef.current = focusPaneOnOpen(pane, active());
    const track = (event: FocusEvent): void => {
      const target = event.target as FocusNode | null;
      if (target !== null && !pane.contains(target)) {
        openerRef.current = target;
      }
    };
    document.addEventListener("focusin", track);
    return () => {
      document.removeEventListener("focusin", track);
      focusOpenerOnClose(pane, {
        active: active(),
        body: document.body as unknown as FocusNode,
        opener: openerRef.current,
      });
    };
  }, [isShown, paneRef]);
};
