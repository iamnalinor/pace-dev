import type { ReactNode } from "react";

import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { paletteVars } from "../platform/theme.ts";
import { BACKDROP_ENTER, SHEET_ENTER } from "./motion.ts";
import { useTheme } from "./theme-provider.tsx";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
The bottom sheet from the Close artboard: a dimmed backdrop (tap to dismiss), a 22px-radius
surface with a grab handle, a title and an optional subtitle. The modal itself does not
animate: the backdrop fades in place and only the surface slides up, so the dim never rides
up with it.
*/
export const Sheet = ({
  children,
  closeLabel,
  onClose,
  subtitle,
  title,
  visible,
}: {
  readonly children: ReactNode;
  readonly closeLabel: string;
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
        <AnimatedPressable
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          className="absolute inset-0 bg-black/55"
          entering={BACKDROP_ENTER}
          onPress={onClose}
        />
        <Animated.View
          accessibilityViewIsModal
          className="max-h-[90%] rounded-t-[22px] border-t border-line bg-surface px-5 pt-2.5"
          entering={SHEET_ENTER}
          style={{ paddingBottom: Math.max(insets.bottom, 12) + 12 }}
        >
          <View
            className="mb-4 h-1 w-9 self-center rounded-sm"
            style={{ backgroundColor: palette.faint }}
          />
          <Text accessibilityRole="header" className="font-sans text-[20px] font-semibold text-fg">
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
        </Animated.View>
      </View>
    </Modal>
  );
};
