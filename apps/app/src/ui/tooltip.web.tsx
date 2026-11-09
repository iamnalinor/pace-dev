import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type NativeSyntheticEvent, View } from "react-native";

import { z } from "@pace/core";

import type { TooltipProps } from "./tooltip-props.ts";

import { paletteVars } from "../platform/theme.ts";
import { pushEscapeTaker } from "./escape-first.ts";
import { Text } from "./text.tsx";
import { useTheme } from "./theme-provider.tsx";
import { controlsNear, forgetControls, type ScanRoot } from "./tooltip-controls.ts";
import {
  type Box,
  HOVER_DELAY_MS,
  HOVER_GRACE_MS,
  placeTooltip,
  type Size,
  WARM_MS,
} from "./tooltip-place.ts";

type PointerLike = { readonly nativeEvent?: { readonly pointerType?: string } };

/** The web has no host to set up: the bubble goes straight into the page's body. */
export const TooltipHost = ({ children }: { readonly children: ReactNode }) => children;

/**
When a tooltip last closed (or 0): a trigger hovered soon after shows its own at once, so moving
along a row of icon buttons reads each name without the delay again. One page, one pointer.
*/
const warmth = { closedAt: 0, openCount: 0 };

const isWarm = (): boolean => warmth.openCount > 0 || Date.now() - warmth.closedAt < WARM_MS;

/** Where the trigger is in the window right now (nothing to measure under test). */
const boxOf = (element: unknown): Box | null => {
  const node = element as null | Partial<Pick<Element, "getBoundingClientRect">>;
  if (typeof node?.getBoundingClientRect !== "function") {
    return null;
  }
  const rect = node.getBoundingClientRect();
  return { height: rect.height, width: rect.width, x: rect.left, y: rect.top };
};

/** The trigger's box and the controls around it, read when the tooltip shows. */
type Anchor = { readonly box: Box; readonly others: readonly Box[] };

/**
The controls around the trigger, read when the tooltip shows: in the trigger's dialog when it is in
one, else the page; a warm hover reuses the last read (`controlsNear`, UI review I3).
*/
const othersNear = (element: unknown, anchor: Box | null): readonly Box[] => {
  const trigger = element as null | Partial<Pick<Element, "closest">>;
  if (
    anchor === null ||
    typeof document === "undefined" ||
    typeof trigger?.closest !== "function"
  ) {
    return [];
  }
  const dialog = trigger.closest('[role="dialog"], [aria-modal="true"]');
  const root = (dialog ?? document) as unknown as ScanRoot;
  return controlsNear(anchor, { now: Date.now(), reuseMs: WARM_MS, root });
};

/** Keyboard focus, not the focus a click leaves behind. */
const isKeyboardFocus = (target: unknown): boolean => {
  const node = target as Partial<Pick<Element, "matches">> | undefined;
  return typeof node?.matches !== "function" || node.matches(":focus-visible");
};

const isTouch = (event: PointerLike): boolean => event.nativeEvent?.pointerType === "touch";

/** What a tooltip explains: a control (a button, a switch, anything that takes focus). */
const TRIGGER = '[role="button"], [role="switch"], button, [tabindex]';

/** The trigger: the first control down the wrapper's first child (it may sit in a box). */
const firstControl = (node: Element | null): Element | null =>
  node === null || node.matches(TRIGGER) ? node : firstControl(node.firstElementChild);

/**
Points the trigger's description at the bubble: the trigger is the first control inside the
wrapper (react-native-web gives a View its DOM node as the ref).
*/
const useDescribedBy = (wrapperRef: RefObject<null | View>, id: string, isOn: boolean): void => {
  useEffect(() => {
    const wrapper = wrapperRef.current as unknown as null | Partial<Element>;
    if (!isOn || wrapper?.firstElementChild === undefined) {
      return;
    }
    const trigger = firstControl(wrapper.firstElementChild);
    trigger?.setAttribute("aria-describedby", id);
    return () => {
      trigger?.removeAttribute("aria-describedby");
    };
  }, [id, isOn, wrapperRef]);
};

/**
While it shows: Escape anywhere (taken before any shortcut or dialog, `escape-first.ts`) and a
scroll (it would be left behind) take it away.
*/
const useDismiss = (isShown: boolean, hide: () => void): void => {
  const hideRef = useRef(hide);
  useEffect(() => {
    hideRef.current = hide;
  });
  useEffect(() => {
    if (!isShown) {
      return;
    }
    warmth.openCount += 1;
    return () => {
      warmth.openCount -= 1;
      warmth.closedAt = Date.now();
    };
  }, [isShown]);
  useEffect(() => {
    if (!isShown) {
      return;
    }

    // Only the tooltip goes: the pane, sheet or dialog under it hears nothing of this Escape.
    return pushEscapeTaker(() => {
      hideRef.current();
    });
  }, [isShown]);
  useEffect(() => {
    if (!isShown || typeof globalThis.addEventListener !== "function") {
      return;
    }
    const dismiss = (): void => {
      // The page moved: the controls read around the trigger are where they were no more.
      forgetControls();
      hideRef.current();
    };
    globalThis.addEventListener("scroll", dismiss, { capture: true });
    globalThis.addEventListener("resize", dismiss);
    return () => {
      globalThis.removeEventListener("scroll", dismiss, { capture: true });
      globalThis.removeEventListener("resize", dismiss);
    };
  }, [isShown]);
};

/** One timer at a time: the pending show (the hover delay) or the pending hide (the grace). */
const useTimer = () => {
  const timerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  const cancel = (): void => {
    if (timerRef.current === null) {
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => cancel, []);
  return {
    after: (ms: number, run: () => void): void => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        run();
      }, ms);
    },
    cancel,
  };
};

/**
Fixed to the window over the page, at its place once both it and its trigger are measured; until
then (its first layout) it is laid out unseen.
*/
const frameStyle = (anchor: Anchor | null, size: null | Size) => {
  const viewport = { height: globalThis.innerHeight, width: globalThis.innerWidth };
  const place =
    anchor === null || size === null
      ? null
      : placeTooltip(anchor.box, size, { others: anchor.others, viewport });
  return {
    left: place?.left ?? 0,
    opacity: place === null ? 0 : 1,
    position: "fixed" as "absolute",
    top: place?.top ?? 0,
    ...(anchor === null && { visibility: "hidden" }),
    zIndex: z.tooltip,
  };
};

/**
The bubble (spec §4.2.31): an elevated surface, `footnote` in `label.primary`, wrapping inside
`size.tooltip.max`; in the page's body (no clipping card can cut it) in the theme's colours. It is
mounted only while shown (UI review I3: a Week of blocks no longer keeps a portal per block); the
trigger's description is the hidden `Description` beside it. It takes the pointer: it can be
hovered and its words selected (WCAG 1.4.13).
*/
const Bubble = ({
  anchor,
  label,
  onPointerEnter,
  onPointerLeave,
}: {
  readonly anchor: Anchor | null;
  readonly label: string;
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
}) => {
  const { scheme } = useTheme();
  const [size, setSize] = useState<null | Size>(null);
  const bubble = (
    <View
      onLayout={(event) => {
        setSize(event.nativeEvent.layout);
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      pointerEvents="auto"
      style={[paletteVars(scheme), frameStyle(anchor, size)]}
      testID="tooltip-bubble"
    >
      <View
        className="max-w-tooltip-max rounded-sm border border-separator bg-elevated px-3 py-2"
        role="tooltip"
      >
        <Text role="footnote">{label}</Text>
      </View>
    </View>
  );
  return typeof document === "undefined" ? bubble : createPortal(bubble, document.body);
};

/**
What the trigger's `aria-describedby` points at: the label, never drawn and never laid out
(`display: none`; a description may name a hidden element), there whether the bubble shows or not.
*/
const Description = ({ id, label }: { readonly id: string; readonly label: string }) => (
  <View id={id} style={{ display: "none" }} testID="tooltip-description">
    <Text role="footnote">{label}</Text>
  </View>
);

/**
What shows and why: shown by the pointer resting on the trigger (`hover`) or by the keyboard's
focus on it (`focus`), with the trigger's place; and the moves that show and hide it.
*/
const useTooltipState = (wrapperRef: RefObject<null | View>) => {
  /** How it came to show: the pointer resting on it, or the keyboard's focus on its trigger. */
  type Mode = "focus" | "hover";
  const [shown, setShown] = useState<null | {
    readonly mode: Mode;
    readonly anchor: Anchor | null;
  }>(null);
  // What was last asked for, before React draws it: a leave right after an immediate show (a quick
  // pass over the trigger) must see the tooltip as shown, or nothing would ever hide it.
  const modeRef = useRef<Mode | null>(null);
  const timer = useTimer();
  const show = (mode: Mode): void => {
    timer.cancel();
    modeRef.current = mode;
    const box = boxOf(wrapperRef.current);
    setShown({
      anchor: box === null ? null : { box, others: othersNear(wrapperRef.current, box) },
      mode,
    });
  };
  const hide = (): void => {
    timer.cancel();
    modeRef.current = null;
    setShown(null);
  };
  return {
    hide,
    /** The pointer is on the trigger: shown after the delay, at once when `isAtOnce`. */
    hover: (isAtOnce: boolean): void => {
      if (modeRef.current !== null) {
        timer.cancel();
      } else if (isAtOnce || isWarm()) {
        show("hover");
      } else {
        timer.after(HOVER_DELAY_MS, () => {
          show("hover");
        });
      }
    },
    /** The pointer is back on the bubble: a pending hide is called off. */
    keep: (): void => {
      if (modeRef.current !== null) {
        timer.cancel();
      }
    },
    /** The pointer left the trigger or the bubble: a hover tooltip goes after the grace. */
    leave: (): void => {
      if (modeRef.current === null) {
        timer.cancel();
      } else if (modeRef.current === "hover") {
        timer.after(HOVER_GRACE_MS, hide);
      }
    },
    shown,
    showForFocus: (): void => {
      show("focus");
    },
  };
};

/**
A short explanation of its trigger, anchored to it (spec §4.2.31, §6 tooltip). A mouse resting on
the trigger shows it after 400 ms (at once for a reason a control is unavailable, `isImmediate`,
and at once when moving on from another tooltip); the keyboard's focus shows it at once. It stays
while the pointer is on the trigger or on the bubble, and goes a moment after the pointer leaves
both, when focus moves on, or on Escape. A touch shows nothing: the tap runs the control.
*/
export const Tooltip = ({
  children,
  isFilling = false,
  isImmediate = false,
  label,
}: TooltipProps) => {
  const id = useId();
  const wrapperRef = useRef<View>(null);
  const state = useTooltipState(wrapperRef);
  const isShown = label !== undefined && state.shown !== null;
  useDescribedBy(wrapperRef, id, label !== undefined);
  useDismiss(isShown, state.hide);
  return (
    <View
      {...(isFilling && { className: "flex-1" })}
      onBlur={() => {
        if (state.shown?.mode === "focus") {
          state.hide();
        }
      }}
      onFocus={(event: NativeSyntheticEvent<unknown>) => {
        if (isKeyboardFocus(event.target)) {
          state.showForFocus();
        }
      }}
      onPointerEnter={(event) => {
        if (label !== undefined && !isTouch(event)) {
          state.hover(isImmediate);
        }
      }}
      onPointerLeave={(event) => {
        if (!isTouch(event)) {
          state.leave();
        }
      }}
      ref={wrapperRef}
    >
      {children}
      {label === undefined ? null : <Description id={id} label={label} />}
      {isShown ? (
        <Bubble
          anchor={state.shown?.anchor ?? null}
          label={label}
          onPointerEnter={state.keep}
          onPointerLeave={state.leave}
        />
      ) : null}
    </View>
  );
};
