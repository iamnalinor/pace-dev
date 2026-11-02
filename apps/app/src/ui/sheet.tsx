import { X } from "lucide-react-native";
import { type ReactNode, useId } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { paletteVars } from "../platform/theme.ts";
import { ButtonWidthContext } from "./button.tsx";
import { cx } from "./cx.ts";
import { IconButton } from "./icon-button.tsx";
import { useIsWide } from "./layout.ts";
import { BACKDROP_ENTER, DIALOG_ENTER, SHEET_ENTER } from "./motion.ts";
import { useScrim } from "./scrim.ts";
import { useTheme } from "./theme-provider.tsx";
import { HotkeyLayer } from "./use-hotkey.tsx";

/** Fills the modal under the sheet; a style object, the animated views take no class names. */
const FILL = { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 } as const;

/** The phone sheet's frame: most of the height, the full width. */
const FRAME = { alignSelf: "center", maxHeight: "90%", maxWidth: 640, width: "100%" } as const;

/** The wide window's dialog: centred, a form's width, never taller than the window. */
const DIALOG_FRAME = {
  alignSelf: "center",
  maxHeight: "85%",
  maxWidth: 560,
  width: "92%",
} as const;

/** The dim behind: it fades in where it is, and a tap on it closes the sheet. */
const Backdrop = ({
  closeLabel,
  onClose,
}: {
  readonly closeLabel: string;
  readonly onClose: () => void;
}) => (
  <Animated.View entering={BACKDROP_ENTER} style={FILL}>
    <Pressable
      accessibilityLabel={closeLabel}
      accessibilityRole="button"
      className="flex-1 bg-scrim"
      onPress={onClose}
    />
  </Animated.View>
);

/** The phone sheet's grab handle. */
const GrabHandle = () => {
  const { palette } = useTheme();
  return (
    <View
      className="mb-4 h-1 w-10 self-center rounded-sm"
      style={{ backgroundColor: palette["label.quaternary"] }}
    />
  );
};

/** The title, the optional subtitle and, on a wide window, the close cross beside them. */
const SheetTitle = ({
  closeLabel,
  isWide,
  onClose,
  subtitle,
  title,
  titleId,
}: {
  readonly closeLabel: string;
  readonly isWide: boolean;
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
        <Text className="mt-1 font-sans text-footnote text-label-secondary">{subtitle}</Text>
      )}
    </View>
    {isWide ? (
      // The cross's middle on the title's first line (QA round 16 L10: it sat about 4 px low): a
      // box as tall as the title's line (`text-title2` is 24 from `lg`, where this shows) centres it.
      <View className="-mr-2 h-6 justify-center">
        <IconButton icon={X} label={closeLabel} onPress={onClose} variant="plain" />
      </View>
    ) : null}
  </View>
);

/**
Under the title: the fixed header, the scrolling body and the fixed footer. The body shrinks and
clips inside the frame, under a hairline: scrolled content meets an edge instead of seeming to run
into the title; its scroll stays in it, the page behind never scrolls on (QA round 15 L8).
*/
const SheetBody = ({
  children,
  footer,
  header,
}: {
  readonly children: ReactNode;
  readonly footer: ReactNode;
  readonly header: ReactNode;
}) => (
  <>
    {header === undefined ? null : <View className="mt-3 gap-3">{header}</View>}
    <ScrollView
      className="mt-3 min-h-0 shrink overscroll-contain border-t border-separator"
      contentContainerClassName="gap-5 pt-4"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
    {footer === undefined ? null : <View className="border-t border-separator pt-3">{footer}</View>}
  </>
);

/** The sheet's own hotkeys; its buttons are its actions, taking its width also on a computer. */
const SheetLayer = ({ children }: { readonly children: ReactNode }) => (
  <HotkeyLayer>
    <ButtonWidthContext value="fill">{children}</ButtonWidthContext>
  </HotkeyLayer>
);

/**
A form or a choice over the screen, the way each platform expects one. On a phone it is the
bottom sheet from the Close artboard: a grab handle, dismissed by a tap on the dim or the
system back. On a wide window it is a dialog in the middle with a close cross; Escape and a
click outside close it too. Neither has a Back or Cancel button: leaving is always one tap
away. Its buttons fill its width on every window. The modal itself does not animate: the backdrop fades in place and only the surface
moves, so the dim never rides along with it.
*/
export const Sheet = ({
  children,
  closeLabel,
  footer,
  formLabel,
  header,
  onClose,
  subtitle,
  title,
  visible,
}: {
  readonly children: ReactNode;
  readonly closeLabel: string;
  /** Stays under the scrolling body (a long form keeps its buttons in sight). */
  readonly footer?: ReactNode;
  /** The sheet is a form (its fields and the footer's buttons), named this. */
  readonly formLabel?: string;
  /** Stays under the title, above the scrolling body: a picker's Stop, its switch, its search. */
  readonly header?: ReactNode;
  readonly onClose: () => void;
  readonly subtitle?: string;
  readonly title: string;
  readonly visible: boolean;
}) => {
  const { scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const titleId = useId();
  // The web page dims its status bar (`theme-color`) with the backdrop.
  useScrim(visible);
  return (
    // The dialog (react-native-web gives the modal the role) is named by its title (QA round 15 L8).
    <Modal
      animationType="none"
      aria-labelledby={titleId}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <SheetLayer>
        {/* A modal renders outside the app's root (a portal on the web): the theme's variables
      are declared again here, or the sheet would lose its surface and ink. */}
        <View
          className={cx("flex-1", isWide ? "justify-center" : "justify-end")}
          style={paletteVars(scheme)}
        >
          {/* The animated wrappers only move; the look is on plain views inside (class names
        on reanimated views are dropped on the web, which left the sheet see-through). */}
          <Backdrop closeLabel={closeLabel} onClose={onClose} />
          <Animated.View
            entering={isWide ? DIALOG_ENTER : SHEET_ENTER}
            style={isWide ? DIALOG_FRAME : FRAME}
          >
            <View
              accessibilityViewIsModal
              {...(formLabel !== undefined && { accessibilityLabel: formLabel, role: "form" })}
              // The modal is the dialog already (react-native-web gives it the role); this is its surface.
              {...({ dataSet: { paceSurface: "sheet" } } as object)}
              className={cx(
                "shrink overflow-hidden bg-elevated px-5",
                isWide
                  ? "rounded-lg border border-separator pt-5 shadow-lg"
                  : "rounded-t-sheet border-t border-separator pt-3",
              )}
              style={{ paddingBottom: isWide ? 20 : Math.max(insets.bottom, 12) + 12 }}
            >
              {isWide ? null : <GrabHandle />}
              <SheetTitle
                closeLabel={closeLabel}
                isWide={isWide}
                onClose={onClose}
                subtitle={subtitle}
                title={title}
                titleId={titleId}
              />
              <SheetBody footer={footer} header={header}>
                {children}
              </SheetBody>
            </View>
          </Animated.View>
        </View>
      </SheetLayer>
    </Modal>
  );
};
