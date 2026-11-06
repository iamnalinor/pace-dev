import { type ReactNode, type RefObject, useEffect, useState } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { layout, shadow } from "@pace/core";

import { paletteVars } from "../platform/theme.ts";
import { FILL, OverlayLayer, useOverlayProgress } from "./overlay-frame.tsx";
import { placePopover, POPOVER_SCALE } from "./overlay-motion.ts";
import { useOverlayPhase } from "./overlay-presence.tsx";
import { useSheetFocusRef } from "./sheet-focus.ts";
import { useTheme } from "./theme-provider.tsx";

type Box = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

/** Where the anchor is in the window, measured when the popover opens. */
const useAnchorBox = (anchor: RefObject<null | View>, isOpen: boolean): Box | null => {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    anchor.current?.measureInWindow((...[x, y, width, height]) => {
      setBox({ height, width, x, y });
    });
  }, [anchor, isOpen]);
  return box;
};

/** Scale 0.98 → 1 with a fade from the anchor's edge (160 in, 110 out; reduced: the fade). */
const usePopoverMotion = (isOpen: boolean, letGo: () => void) => {
  const { isReduced, progress } = useOverlayProgress("popover", isOpen, letGo);
  return useAnimatedStyle(() => {
    const step = progress.get();
    return isReduced
      ? { opacity: step }
      : { opacity: step, transform: [{ scale: POPOVER_SCALE + (1 - POPOVER_SCALE) * step }] };
  }, [isReduced]);
};

/** Before the anchor is measured: out of sight, so it never flashes at the corner. */
const UNPLACED = { left: 0, opacity: 0, position: "absolute", top: 0 } as const;

/** At its place; it grows from the anchor's edge (§6: transform-origin = anchor). */
const placedAt = (place: ReturnType<typeof placePopover>) =>
  ({
    left: place.left,
    maxHeight: "60%",
    position: "absolute",
    top: place.top,
    transformOrigin: place.side === "above" ? "bottom left" : "top left",
  }) as const;

export type PopoverProps = {
  /** The control it opens from: the popover is placed against it, and focus goes back to it. */
  readonly anchor: RefObject<null | View>;
  readonly children: ReactNode;
  /** Its accessible name (the picker's question: "Project", "Repeat"). */
  readonly label: string;
  readonly onClose: () => void;
  readonly open: boolean;
  /** `dialog` for a picker with its own controls; `menu` for a list of actions (`ListRow`s). */
  readonly role?: "dialog" | "menu" | undefined;
  /** Its height when known (a list's rows); else the height it is drawn at. Placed above the anchor when it would not fit below. */
  readonly height?: number | undefined;
};

/**
A picker or a menu anchored to the control that opened it, on a wide window (spec §4.2.21, F-CMP-13:
the desktop pickers were centred dialogs far from their buttons): `layout.popover` wide (360),
`radius.lg`, at most 60 % of the window's height with its own scroll; under its trigger, or above it
when the trigger sits on the bottom edge (the time bar). Escape and a click outside close it, with no
dim; it scales in from 98 % at the anchor's edge and fades (§6 popover), and stays mounted through
its exit. Focus starts on its first control and goes back to the trigger when it closes.
*/
export const Popover = ({
  anchor,
  children,
  height = 0,
  label,
  onClose,
  open,
  role = "dialog",
}: PopoverProps) => {
  const { scheme } = useTheme();
  const window = useWindowDimensions();
  const phase = useOverlayPhase(open);
  const style = usePopoverMotion(phase.isOpen, phase.letGo);
  const box = useAnchorBox(anchor, phase.isOpen);
  const surfaceRef = useSheetFocusRef({ closeLabel: label });
  // Its height as drawn when the caller does not know it: a popover on the bottom edge (the time
  // bar's) must open above its trigger, whatever its list holds.
  const [measured, setMeasured] = useState(0);
  const close = (): void => {
    if (phase.isOpen) {
      onClose();
    }
  };
  const place =
    box === null
      ? null
      : placePopover({
          anchor: box,
          size: { height: height > 0 ? height : measured, width: layout.popover },
          window,
        });
  return (
    <Modal
      animationType="none"
      aria-label={label}
      onRequestClose={close}
      testID="overlay-modal"
      transparent
      visible={phase.isMounted}
    >
      <OverlayLayer>
        <View
          className="flex-1"
          pointerEvents={phase.isOpen ? "auto" : "none"}
          style={paletteVars(scheme)}
        >
          {/* A click outside closes it; nothing is dimmed, and it is no stop for the keyboard. */}
          <Pressable
            aria-hidden
            onPress={close}
            style={FILL}
            tabIndex={-1}
            testID="popover-outside"
          />
          <Animated.View
            onLayout={(event) => {
              setMeasured(event.nativeEvent.layout.height);
            }}
            style={[style, place === null ? UNPLACED : placedAt(place)]}
            testID="popover-frame"
          >
            <View
              ref={surfaceRef}
              // A picker's dialog is the modal itself (react-native-web gives it the role, named by
              // `aria-label`); a menu or a list of options says so on its surface.
              {...(role !== "dialog" && { accessibilityLabel: label, role })}
              className="w-popover min-w-popover-min max-w-popover-max shrink overflow-hidden rounded-lg bg-elevated py-2"
              style={{ boxShadow: shadow(scheme, "overlay") }}
              testID="popover-surface"
            >
              {children}
            </View>
          </Animated.View>
        </View>
      </OverlayLayer>
    </Modal>
  );
};
