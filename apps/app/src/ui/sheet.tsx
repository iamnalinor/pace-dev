import type { ReactNode } from "react";

import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "./theme-provider.tsx";

/**
The bottom sheet from the Close artboard: a dimmed backdrop (tap to dismiss), a 22px-radius
surface with a grab handle, a title and an optional subtitle.
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
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          className="absolute inset-0 bg-black/55"
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          className="max-h-[90%] rounded-t-[22px] border-t border-line bg-surface px-5 pt-2.5"
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
        </View>
      </View>
    </Modal>
  );
};
