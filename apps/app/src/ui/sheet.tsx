import type { ReactNode } from "react";

import { X } from "lucide-react-native";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { paletteVars } from "../platform/theme.ts";
import { cx } from "./cx.ts";
import { IconButton } from "./icon-button.tsx";
import { useIsWide } from "./layout.ts";
import { BACKDROP_ENTER, DIALOG_ENTER, SHEET_ENTER } from "./motion.ts";
import { useTheme } from "./theme-provider.tsx";

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
      className="flex-1 bg-black/55"
      onPress={onClose}
    />
  </Animated.View>
);

/** The phone sheet's grab handle. */
const GrabHandle = () => {
  const { palette } = useTheme();
  return (
    <View
      className="mb-4 h-1 w-9 self-center rounded-sm"
      style={{ backgroundColor: palette.faint }}
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
}: {
  readonly closeLabel: string;
  readonly isWide: boolean;
  readonly onClose: () => void;
  readonly subtitle: string | undefined;
  readonly title: string;
}) => (
  <View className="flex-row items-start gap-2">
    <View className="flex-1">
      <Text accessibilityRole="header" className="font-sans text-[20px] font-semibold text-fg">
        {title}
      </Text>
      {subtitle === undefined ? null : (
        <Text className="mt-1 font-sans text-[13px] text-muted">{subtitle}</Text>
      )}
    </View>
    {isWide ? (
      <View className="-mr-2 -mt-1.5">
        <IconButton icon={X} label={closeLabel} onPress={onClose} variant="plain" />
      </View>
    ) : null}
  </View>
);

/**
A form or a choice over the screen, the way each platform expects one. On a phone it is the
bottom sheet from the Close artboard: a grab handle, dismissed by a tap on the dim or the
system back. On a wide window it is a dialog in the middle with a close cross; Escape and a
click outside close it too. Neither has a Back or Cancel button: leaving is always one tap
away. The modal itself does not animate: the backdrop fades in place and only the surface
moves, so the dim never rides along with it.
*/
export const Sheet = ({
  children,
  closeLabel,
  footer,
  formLabel,
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
  readonly onClose: () => void;
  readonly subtitle?: string;
  readonly title: string;
  readonly visible: boolean;
}) => {
  const { scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={visible}>
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
            {...(formLabel === undefined
              ? { accessibilityLabel: title, "aria-modal": true, role: "dialog" }
              : { accessibilityLabel: formLabel, role: "form" })}
            className={cx(
              "shrink overflow-hidden bg-surface px-5",
              isWide
                ? "rounded-2xl border border-line pt-5 shadow-lg"
                : "rounded-t-[22px] border-t border-line pt-2.5",
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
            />
            {/* The body shrinks and clips inside the frame, under a hairline: scrolled content
            meets an edge instead of seeming to run into the title. */}
            <ScrollView
              className="mt-3 min-h-0 shrink border-t border-line"
              contentContainerClassName="gap-[18px] pt-[15px]"
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
            {footer === undefined ? null : (
              <View className="border-t border-line pt-3">{footer}</View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};
