import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { refuseFocus } from "../platform/refuse-focus.ts";
import { ButtonWidthContext } from "./button.tsx";
import { cx } from "./cx.ts";
import { IconButton } from "./icon-button.tsx";
import { EASING } from "./motion-presets.ts";
import { type OverlayKind, overlayTiming } from "./overlay-motion.ts";
import { SheetSubmitScope } from "./sheet-submit.tsx";
import { HotkeyLayer } from "./use-hotkey.tsx";
import { useIsMotionReduced } from "./use-reduced-motion.ts";

/** Fills the modal; a style object, the animated views take no class names. */
export const FILL = { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 } as const;

/**
The dim behind a sheet or a dialog (spec §4.2.21): it fades in and out where it is (the dim never
rides along with the sheet, owner feedback-2) and a tap on it closes the overlay. It never holds
keyboard focus (QA round 18 M1: it took the first focus and a second "Close" stop; QA round 19 L1:
the modal's trap wrapped Shift+Tab onto it), while a screen reader may still move onto it (round 6
M4); where the cross is shown it is hidden from assistive tech too, and on a phone's sheet (no
cross) it stays the reader's way out. No state layer: it is no control to the eye.
*/
export const Scrim = ({
  closeLabel,
  hasCross,
  onPress,
  progress,
}: {
  readonly closeLabel: string;
  readonly hasCross: boolean;
  readonly onPress: () => void;
  /** 0 hidden, 1 shown: the overlay's own enter and exit. */
  readonly progress: SharedValue<number>;
}) => {
  const style = useAnimatedStyle(() => ({ opacity: progress.get() }));
  return (
    <Animated.View style={[FILL, style]}>
      <Pressable
        accessibilityLabel={closeLabel}
        accessibilityRole="button"
        aria-hidden={hasCross}
        className="flex-1 bg-scrim"
        // A focus trap that focuses it anyway (react-native-web's walks every descendant) is refused.
        {...(refuseFocus !== undefined && { onFocus: refuseFocus })}
        onPress={onPress}
        // `focusable={false}` does not reach react-native-web's button; the tab index does.
        tabIndex={-1}
        testID="overlay-scrim"
      />
    </Animated.View>
  );
};

/** The title (`title2`, it wraps), the optional subtitle and the close cross beside them. */
export const OverlayTitle = ({
  closeLabel,
  hasCross,
  onClose,
  subtitle,
  title,
  titleId,
}: {
  readonly closeLabel: string;
  readonly hasCross: boolean;
  readonly onClose: () => void;
  readonly subtitle: string | undefined;
  readonly title: string;
  /** The title's id: the dialog is named by it. */
  readonly titleId: string;
}) => (
  <View className="flex-row items-start gap-2">
    <View className="flex-1">
      <Text
        accessibilityRole="header"
        className="font-sans text-title2 text-label-primary"
        nativeID={titleId}
      >
        {title}
      </Text>
      {subtitle === undefined ? null : (
        <Text className="mt-1 font-sans text-callout text-label-secondary">{subtitle}</Text>
      )}
    </View>
    {hasCross ? (
      // The cross's middle on the title's first line (QA round 16 L10: it sat about 4 px low): a
      // box as tall as the title's line centres it.
      <View className="-mr-2 h-6 justify-center">
        <IconButton icon="x" label={closeLabel} onPress={onClose} />
      </View>
    ) : null}
  </View>
);

/**
Under the title: the fixed header, the scrolling body and the fixed footer. The body shrinks and
scrolls inside the frame; its scroll stays in it, the page behind never scrolls on (QA round 15
L8). A hairline parts it from the title only once it has scrolled (no permanent hairlines, spec
§4.2.21). The ring of a focused control is not clipped: the body keeps 4 px of room on each side
(§7).
*/
export const OverlayBody = ({
  children,
  footer,
  header,
}: {
  readonly children: ReactNode;
  readonly footer: ReactNode;
  readonly header: ReactNode;
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  return (
    <>
      {header === undefined ? null : <View className="mt-3 gap-3">{header}</View>}
      <ScrollView
        className={cx(
          "-mx-1 mt-3 min-h-0 shrink overscroll-contain border-t",
          isScrolled ? "border-separator" : "border-transparent",
        )}
        contentContainerClassName="gap-5 px-1 pb-1 pt-4"
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          setIsScrolled(event.nativeEvent.contentOffset.y > 0);
        }}
        scrollEventThrottle={16}
        testID="overlay-body"
      >
        {children}
      </ScrollView>
      {footer === undefined ? null : (
        <View className="border-t border-separator pt-3">{footer}</View>
      )}
    </>
  );
};

/**
An overlay's own layer: its hotkeys shadow the page's, its buttons fill its width on every window,
and Enter in a single-line field presses its form's primary action (QA round 21 M1).
*/
export const OverlayLayer = ({ children }: { readonly children: ReactNode }) => (
  <HotkeyLayer>
    <SheetSubmitScope>
      <ButtonWidthContext value="fill">{children}</ButtonWidthContext>
    </SheetSubmitScope>
  </HotkeyLayer>
);

/**
The 0 → 1 progress of a dialog's or a popover's enter and its way back: the exit lets the overlay go
(unmounts it) only when it ran to its end; opened again before that, nothing lets go.
*/
export const useOverlayProgress = (kind: OverlayKind, isOpen: boolean, letGo: () => void) => {
  const isReduced = useIsMotionReduced();
  const progress = useSharedValue(0);
  useEffect(() => {
    const { enter, exit } = overlayTiming(kind, isReduced);
    progress.set(
      isOpen
        ? withTiming(1, { duration: enter, easing: EASING.enter })
        : withTiming(0, { duration: exit, easing: EASING.exit }, (isFinished) => {
            if (isFinished === true) {
              scheduleOnRN(letGo);
            }
          }),
    );
  }, [isOpen, isReduced, kind, letGo, progress]);
  return { isReduced, progress };
};

/** The close and the dismiss of an overlay: each asks once, and a dismiss only if it may. */
export const overlayClosers = ({
  dismissible,
  isOpen,
  onClose,
}: {
  readonly dismissible: boolean;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}) => {
  // Closes once: a second tap, Back or Escape during the exit asks nothing more.
  const close = (): void => {
    if (isOpen) {
      onClose();
    }
  };
  const dismiss = (): void => {
    if (dismissible) {
      close();
    }
  };
  return { close, dismiss };
};

/** The title with its optional cross, then the body: what a dialog's and a sheet's surface holds. */
export const OverlayContent = ({
  children,
  closeLabel,
  footer,
  hasCross,
  header,
  onClose,
  subtitle,
  title,
  titleId,
}: {
  readonly children: ReactNode;
  readonly closeLabel: string;
  readonly footer: ReactNode;
  readonly hasCross: boolean;
  readonly header: ReactNode;
  readonly onClose: () => void;
  readonly subtitle: string | undefined;
  readonly title: string;
  readonly titleId: string;
}) => (
  <>
    <OverlayTitle
      closeLabel={closeLabel}
      hasCross={hasCross}
      onClose={onClose}
      subtitle={subtitle}
      title={title}
      titleId={titleId}
    />
    <OverlayBody footer={footer} header={header}>
      {children}
    </OverlayBody>
  </>
);
