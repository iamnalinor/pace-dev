import type { ReactNode } from "react";

import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { paletteVars } from "../platform/theme.ts";
import { BACKDROP_ENTER, SHEET_ENTER } from "./motion.ts";
import { useTheme } from "./theme-provider.tsx";

/** Fills the modal under the sheet; a style object, the animated views take no class names. */
const FILL = { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 } as const;

/** The sheet's frame: most of the height, and no wider than a reading column on a desktop. */
const FRAME = { alignSelf: "center", maxHeight: "90%", maxWidth: 640, width: "100%" } as const;

/**
The bottom sheet from the Close artboard: a dimmed backdrop (tap to dismiss), a 22px-radius
surface with a grab handle, a title and an optional subtitle. The modal itself does not
animate: the backdrop fades in place and only the surface slides up, so the dim never rides
up with it.
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
  const { palette, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={visible}>
      {/* A modal renders outside the app's root (a portal on the web): the theme's variables
      are declared again here, or the sheet would lose its surface and ink. */}
      <View className="flex-1 justify-end" style={paletteVars(scheme)}>
        {/* The animated wrappers only move; the look is on plain views inside (class names
        on reanimated views are dropped on the web, which left the sheet see-through). */}
        <Animated.View entering={BACKDROP_ENTER} style={FILL}>
          <Pressable
            accessibilityLabel={closeLabel}
            accessibilityRole="button"
            className="flex-1 bg-black/55"
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View entering={SHEET_ENTER} style={FRAME}>
          <View
            accessibilityViewIsModal
            {...(formLabel !== undefined && { accessibilityLabel: formLabel, role: "form" })}
            className="shrink rounded-t-[22px] border-t border-line bg-surface px-5 pt-2.5"
            style={{ paddingBottom: Math.max(insets.bottom, 12) + 12 }}
          >
            <View
              className="mb-4 h-1 w-9 self-center rounded-sm"
              style={{ backgroundColor: palette.faint }}
            />
            <Text
              accessibilityRole="header"
              className="font-sans text-[20px] font-semibold text-fg"
            >
              {title}
            </Text>
            {subtitle === undefined ? null : (
              <Text className="mt-1 font-sans text-[13px] text-muted">{subtitle}</Text>
            )}
            <ScrollView
              contentContainerClassName="gap-[18px] pt-[18px]"
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
