import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { refuseFocus } from "../platform/refuse-focus.ts";
import { ButtonWidthContext } from "./button.tsx";
import { cx } from "./cx.ts";
import { IconButton } from "./icon-button.tsx";
import { SheetSubmitScope } from "./sheet-submit.tsx";
import { HotkeyLayer } from "./use-hotkey.tsx";

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
        <IconButton icon="x" label={closeLabel} onPress={onClose} variant="plain" />
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
