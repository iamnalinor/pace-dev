import { useEffect, useId, useRef } from "react";
import { Modal, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { motion, shadow } from "@pace/core";

import { paletteVars } from "../platform/theme.ts";
import { Dialog, type DialogProps } from "./dialog.tsx";
import { useIsWide } from "./layout.ts";
import { timing } from "./motion-presets.ts";
import { overlayClosers, OverlayContent, OverlayLayer, Scrim } from "./overlay-frame.tsx";
import { overlayTiming, shouldDismiss } from "./overlay-motion.ts";
import { HAS_SHEET_CROSS, IS_HANDLE_ACCESSIBLE } from "./overlay-platform.ts";
import { useOverlayPhase } from "./overlay-presence.tsx";
import { useScrim } from "./scrim.ts";
import { useSheetFocusRef } from "./sheet-focus.ts";
import { useTheme } from "./theme-provider.tsx";
import { useIsMotionReduced } from "./use-reduced-motion.ts";

/** The phone sheet's frame: as wide as the window (at most 640), at most 90 % of its height. */
const FRAME = { alignSelf: "center", maxHeight: "90%", maxWidth: 640, width: "100%" } as const;

/** How far a sheet that may not be dismissed follows a drag down: a rubber band, then back. */
const RUBBER = 0.2;

/** The sheet's motion values: the dim's and the reduced fade's progress, and where the sheet is. */
type SheetMotion = {
  /** 0 hidden, 1 shown: the dim's opacity (and the sheet's, under reduced motion). */
  readonly progress: SharedValue<number>;
  /** How far below its place the sheet is: its own height while hidden, 0 in place. */
  readonly offset: SharedValue<number>;
  /** The finger's pull on top of that. */
  readonly drag: SharedValue<number>;
  /** The sheet's measured height (0 until its first layout); the JS side reads it. */
  readonly heightRef: { current: number };
};

/**
The sheet's enter and exit (spec §6 sheet): it travels its **own** measured height (280 in on
`easing.enter`, 200 out on `easing.exit`) while the dim fades in place; reduced motion fades both
(160). The enter starts at the first layout, when that height is known; the exit lets go from its
completion, never a timer (F-MOT-03, F-MOT-05).
*/
const startEnter = ({ offset, progress }: SheetMotion, isReduced: boolean): void => {
  const { enter: duration } = overlayTiming("sheet", isReduced);
  const config = timing(duration, "enter");
  progress.set(withTiming(1, config));
  offset.set(isReduced ? 0 : withTiming(0, config));
};

/** The exit: down its own height (from where a dismissing drag let go) while the dim fades. */
const startExit = (
  { drag, heightRef, offset, progress }: SheetMotion,
  isReduced: boolean,
  letGo: () => void,
): void => {
  const { exit: duration } = overlayTiming("sheet", isReduced);
  const config = timing(duration, "exit");
  offset.set(offset.get() + drag.get());
  drag.set(0);
  if (!isReduced) {
    offset.set(withTiming(heightRef.current, config));
  }
  progress.set(
    withTiming(0, config, (isFinished) => {
      // Opened again before the exit finished: nothing lets go.
      if (isFinished === true) {
        scheduleOnRN(letGo);
      }
    }),
  );
};

const useSheetMotion = (isOpen: boolean, letGo: () => void) => {
  const isReduced = useIsMotionReduced();
  const { height: windowHeight } = useWindowDimensions();
  const progress = useSharedValue(0);
  // Below the window until measured: nothing shows before the enter starts.
  const offset = useSharedValue(windowHeight);
  const drag = useSharedValue(0);
  const heightRef = useRef(0);
  // The `isOpen` the last animation answered: only a change of it animates.
  const answeredRef = useRef<boolean | undefined>(undefined);
  const hasEnteredRef = useRef(false);
  useEffect(() => {
    const values = { drag, heightRef, offset, progress };
    const answered = answeredRef.current;
    answeredRef.current = isOpen;
    if (answered === isOpen || (answered === undefined && !isOpen)) {
      return;
    }
    if (!isOpen) {
      startExit(values, isReduced, letGo);
      return;
    }
    // Opened again during the exit, or already measured: in from where it is. Else the first
    // layout starts it, once the height to travel is known.
    if (heightRef.current <= 0) {
      return;
    }
    hasEnteredRef.current = true;
    startEnter(values, isReduced);
  }, [drag, heightRef, isOpen, isReduced, letGo, offset, progress]);
  const onLayout = (measured: number): void => {
    heightRef.current = measured;
    if (!isOpen || hasEnteredRef.current || measured <= 0) {
      return;
    }
    hasEnteredRef.current = true;
    offset.set(isReduced ? 0 : measured);
    startEnter({ drag, heightRef, offset, progress }, isReduced);
  };
  const values: SheetMotion = { drag, heightRef, offset, progress };
  const style = useAnimatedStyle(() =>
    isReduced
      ? { opacity: progress.get() }
      : { transform: [{ translateY: offset.get() + drag.get() }] },
  );
  return { onLayout, style, values };
};

/**
The handle's drag (spec §4.2.21, F-CMP-02: the handle was drawn and did nothing): the sheet follows
the finger down; released past 30 % of its height or at 800 dp/s it closes, otherwise it springs
back on `spring.sheet`. A sheet that may not be dismissed only rubber-bands.
*/
const handleDrag = (
  { drag, heightRef }: SheetMotion,
  { dismissible, onDismiss }: { readonly dismissible: boolean; readonly onDismiss: () => void },
) =>
  Gesture.Pan()
    .runOnJS(true)
    .withTestId("sheet-handle")
    .onUpdate((event) => {
      const down = Math.max(event.translationY, 0);
      drag.set(dismissible ? down : down * RUBBER);
    })
    .onEnd((event) => {
      const release = {
        height: heightRef.current,
        translation: event.translationY,
        velocity: event.velocityY,
      };
      if (dismissible && shouldDismiss(release)) {
        onDismiss();
        return;
      }
      drag.set(withSpring(0, { ...motion.spring.sheet, velocity: event.velocityY }));
    });

/**
The grab handle at the top: a 48 dp zone the finger drags (a real one), its bar `space.8` × `space.2`
in `label.quaternary`. For TalkBack it is an element of its own whose action closes the sheet.
*/
const Handle = ({
  closeLabel,
  gesture,
  onDismiss,
}: {
  readonly closeLabel: string;
  readonly gesture: ReturnType<typeof handleDrag>;
  readonly onDismiss: () => void;
}) => (
  <GestureDetector gesture={gesture}>
    <View
      accessibilityActions={[{ label: closeLabel, name: "escape" }]}
      accessibilityLabel={closeLabel}
      accessible={IS_HANDLE_ACCESSIBLE}
      aria-hidden={!IS_HANDLE_ACCESSIBLE}
      className="-mt-3 h-hit items-center justify-center"
      onAccessibilityAction={onDismiss}
      onAccessibilityEscape={onDismiss}
      testID="sheet-handle-zone"
    >
      <View className="h-1 w-8 rounded-pill bg-label-quaternary" />
    </View>
  </GestureDetector>
);

export type SheetProps = Omit<DialogProps, "width">;

type SurfaceProps = Pick<
  SheetProps,
  "children" | "closeLabel" | "footer" | "formLabel" | "header" | "name" | "subtitle" | "title"
> & {
  readonly close: () => void;
  readonly gesture: ReturnType<typeof handleDrag>;
  readonly titleId: string;
};

/**
The sheet itself: the elevated surface with its top corners rounded, the handle, the title and the
body. Light gives it the overlay shadow, dark the 1 px inner hairline the token carries; the bottom
clears the gesture area (max(inset, `space.3`) + `space.3`).
*/
const SheetSurface = ({
  children,
  close,
  closeLabel,
  footer,
  formLabel,
  gesture,
  header,
  name,
  subtitle,
  title,
  titleId,
}: SurfaceProps) => {
  const { scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const surfaceRef = useSheetFocusRef({ closeLabel });
  return (
    <View
      accessibilityViewIsModal
      ref={surfaceRef}
      {...(formLabel !== undefined && { accessibilityLabel: formLabel, role: "form" })}
      // The modal is the dialog already (react-native-web gives it the role); this is its surface.
      {...({ dataSet: { paceSheet: name, paceSurface: "sheet" } } as object)}
      className="shrink rounded-t-sheet bg-elevated px-sheet-pad pt-3"
      style={{
        boxShadow: shadow(scheme, "overlay"),
        paddingBottom: Math.max(insets.bottom, 12) + 12,
      }}
    >
      <Handle closeLabel={closeLabel} gesture={gesture} onDismiss={close} />
      <OverlayContent
        closeLabel={closeLabel}
        footer={footer}
        hasCross={HAS_SHEET_CROSS}
        header={header}
        onClose={close}
        subtitle={subtitle}
        title={title}
        titleId={titleId}
      >
        {children}
      </OverlayContent>
    </View>
  );
};

/** The phone's bottom sheet; `Sheet` hands a wide window the `Dialog` instead. */
const BottomSheet = ({ dismissible = true, onClose, open, ...surface }: SheetProps) => {
  const { scheme } = useTheme();
  const titleId = useId();
  const phase = useOverlayPhase(open);
  const sheet = useSheetMotion(phase.isOpen, phase.letGo);
  useScrim(phase.isOpen);
  const { close, dismiss } = overlayClosers({ dismissible, isOpen: phase.isOpen, onClose });
  const gesture = handleDrag(sheet.values, { dismissible, onDismiss: close });
  return (
    <Modal
      animationType="none"
      aria-labelledby={titleId}
      onRequestClose={dismiss}
      testID="overlay-modal"
      transparent
      visible={phase.isMounted}
    >
      <OverlayLayer>
        {/* Outside the app's root (a portal on the web): the theme's variables again, or no ink. */}
        <View
          className="flex-1 justify-end"
          pointerEvents={phase.isOpen ? "auto" : "none"}
          style={paletteVars(scheme)}
        >
          <Scrim
            closeLabel={surface.closeLabel}
            hasCross={HAS_SHEET_CROSS}
            onPress={dismiss}
            progress={sheet.values.progress}
          />
          {/* The animated wrapper only moves; the look is on a plain view inside (class names on
          reanimated views are dropped on the web, which left the sheet see-through). */}
          <Animated.View
            onLayout={(event) => {
              sheet.onLayout(event.nativeEvent.layout.height);
            }}
            style={[FRAME, sheet.style]}
            testID="sheet-frame"
          >
            <SheetSurface {...surface} close={close} gesture={gesture} titleId={titleId} />
          </Animated.View>
        </View>
      </OverlayLayer>
    </Modal>
  );
};

/**
A form or a choice over the screen, the way each platform expects one (spec §4.2.21). On a phone
(and a tablet) it is the bottom sheet: a real grab handle that drags it down and away, a tap on the
dim and the system Back close it, and on the web a close cross too (a phone's browser has no Back to
rely on). On a wide window it is the centred `Dialog`. Neither has a Back or Cancel button: leaving
is always one gesture away. The sheet travels its own height in and out while the dim fades in
place, and stays mounted through its exit (an owner that mounts it only while open wraps it in
`OverlayPresence`). `dismissible={false}` keeps it open against a drag, the dim and Back (it
rubber-bands); its cross still closes it.
*/
export const Sheet = (props: SheetProps) => {
  const isWide = useIsWide();
  return isWide ? <Dialog {...props} /> : <BottomSheet {...props} />;
};
