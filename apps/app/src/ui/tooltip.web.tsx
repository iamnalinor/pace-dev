import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type NativeSyntheticEvent, Text, View } from "react-native";

import { paletteVars } from "../platform/theme.ts";
import { useTheme } from "./theme-provider.tsx";
import { type Box, placeTooltip, type Size, TAP_TOOLTIP_MS } from "./tooltip-place.ts";

/** How it came to show: the pointer over it, the keyboard's focus on it, or a finger's tap. */
type Mode = "focus" | "hover" | "tap";

type Shown = { readonly mode: Mode; readonly anchor: Box | null };

type PointerLike = { readonly nativeEvent?: { readonly pointerType?: string } };

/** The web has no host to set up: the bubble goes straight into the page's body. */
export const TooltipHost = ({ children }: { readonly children: ReactNode }) => children;

/** Where the trigger is in the window right now (nothing to measure under test). */
const boxOf = (element: unknown): Box | null => {
  const node = element as null | Partial<Pick<Element, "getBoundingClientRect">>;
  if (typeof node?.getBoundingClientRect !== "function") {
    return null;
  }
  const rect = node.getBoundingClientRect();
  return { height: rect.height, width: rect.width, x: rect.left, y: rect.top };
};

/** Keyboard focus, not the focus a click or a tap leaves behind. */
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
While it shows: Escape anywhere, a scroll (it would be left behind) and, for a tap, the next
touch anywhere or a couple of seconds take it away.
*/
const useDismiss = (mode: Mode | null, hide: () => void): void => {
  const hideRef = useRef(hide);
  useEffect(() => {
    hideRef.current = hide;
  });
  useEffect(() => {
    if (mode === null || typeof globalThis.addEventListener !== "function") {
      return;
    }
    const dismiss = (): void => {
      hideRef.current();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        dismiss();
      }
    };
    globalThis.addEventListener("keydown", onKey, { capture: true });
    globalThis.addEventListener("scroll", dismiss, { capture: true });
    const isTap = mode === "tap";
    if (isTap) {
      globalThis.addEventListener("pointerdown", dismiss, { capture: true });
    }
    return () => {
      globalThis.removeEventListener("keydown", onKey, { capture: true });
      globalThis.removeEventListener("scroll", dismiss, { capture: true });
      if (isTap) {
        globalThis.removeEventListener("pointerdown", dismiss, { capture: true });
      }
    };
  }, [mode]);
  useEffect(() => {
    if (mode !== "tap") {
      return;
    }
    const timer = setTimeout(() => {
      hideRef.current();
    }, TAP_TOOLTIP_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [mode]);
};

/**
Fixed to the window over the page, at its place once both it and its trigger are measured. A
hidden one is still laid out (and measured), only not seen.
*/
const frameStyle = (anchor: Box | null, size: null | Size) => {
  const viewport = { height: globalThis.innerHeight, width: globalThis.innerWidth };
  const place = anchor === null || size === null ? null : placeTooltip(anchor, size, viewport);
  return {
    left: place?.left ?? 0,
    opacity: place === null ? 0 : 1,
    position: "fixed" as "absolute",
    top: place?.top ?? 0,
    ...(anchor === null && { visibility: "hidden" }),
    zIndex: 1000,
  };
};

/**
The bubble, in the page's body (no clipping card can cut it) in the theme's colours. It stays
in the page while hidden, so the trigger's description can point at it.
*/
const Bubble = ({
  anchor,
  id,
  isVisible,
  label,
}: {
  readonly anchor: Box | null;
  readonly id: string;
  readonly isVisible: boolean;
  readonly label: string;
}) => {
  const { scheme } = useTheme();
  const [size, setSize] = useState<null | Size>(null);
  const bubble = (
    <View
      aria-hidden={!isVisible}
      onLayout={(event) => {
        setSize(event.nativeEvent.layout);
      }}
      pointerEvents="none"
      style={[paletteVars(scheme), frameStyle(isVisible ? anchor : null, size)]}
    >
      <View className="max-w-tooltip-max rounded-md border border-separator bg-elevated px-2 py-1">
        <Text className="font-sans text-footnote text-label-primary" id={id} role="tooltip">
          {label}
        </Text>
      </View>
    </View>
  );
  return typeof document === "undefined" ? bubble : createPortal(bubble, document.body);
};

/**
A short explanation of its trigger, anchored to it. With a mouse it shows the moment the
pointer is over the trigger (and on keyboard focus) and goes when the pointer leaves, focus
moves on or Escape is pressed; on a touch screen a tap shows it (the trigger's own press still
runs) for a couple of seconds or until the next touch.
*/
export const Tooltip = ({
  children,
  label,
  showsOnTap = true,
}: {
  readonly children: ReactNode;
  readonly label: string | undefined;
  /** False for a control whose tap changes the screen anyway (a bubble would be left behind). */
  readonly showsOnTap?: boolean;
}) => {
  const id = useId();
  const wrapperRef = useRef<View>(null);
  const [shown, setShown] = useState<null | Shown>(null);
  const show = (mode: Mode): void => {
    setShown({ anchor: boxOf(wrapperRef.current), mode });
  };
  const hide = (): void => {
    setShown(null);
  };
  const mode = label === undefined ? null : (shown?.mode ?? null);
  useDescribedBy(wrapperRef, id, label !== undefined);
  useDismiss(mode, hide);
  // Events react-native-web passes to the DOM but React Native's types do not list.
  const keys = {
    onKeyDown: (event: { readonly key?: string }) => {
      if (event.key === "Escape") {
        hide();
      }
    },
  };
  return (
    <View
      onBlur={hide}
      onFocus={(event: NativeSyntheticEvent<unknown>) => {
        if (isKeyboardFocus(event.target)) {
          show("focus");
        }
      }}
      onPointerEnter={(event) => {
        // Shown for the keyboard's focus, it stays that way until the focus moves on.
        if (!isTouch(event) && shown?.mode !== "focus") {
          show("hover");
        }
      }}
      onPointerLeave={(event) => {
        if (!isTouch(event) && shown?.mode === "hover") {
          hide();
        }
      }}
      onPointerUp={(event) => {
        if (showsOnTap && isTouch(event)) {
          show("tap");
        }
      }}
      ref={wrapperRef}
      {...(keys as object)}
    >
      {children}
      {label === undefined ? null : (
        <Bubble anchor={shown?.anchor ?? null} id={id} isVisible={mode !== null} label={label} />
      )}
    </View>
  );
};
