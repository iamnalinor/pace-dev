import type { ReactNode } from "react";

import { ChevronLeft, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { cx } from "./cx.ts";
import { useTheme } from "./theme-provider.tsx";

/** The pushed-screen header (Inbox, Project, Task): a 44px back chevron, a title, actions. */
export const BackHeader = ({
  backIcon: BackIcon = ChevronLeft,
  backLabel,
  children,
  onBack,
  right,
}: {
  /** A cross for a pane that closes rather than a screen to go back from. */
  readonly backIcon?: LucideIcon;
  readonly backLabel: string;
  readonly children?: ReactNode;
  /** Without it there is no back chevron (a top-level screen beside the sidebar). */
  readonly onBack?: () => void;
  readonly right?: ReactNode;
}) => {
  const { palette } = useTheme();
  return (
    <View
      className={cx(
        "flex-row items-center gap-1 pb-3 pr-4 pt-4",
        onBack === undefined ? "pl-5" : "pl-2",
      )}
    >
      {onBack === undefined ? null : (
        <Pressable
          accessibilityLabel={backLabel}
          accessibilityRole="button"
          className="h-hit-web w-hit-web items-center justify-center active:opacity-70"
          onPress={onBack}
        >
          <BackIcon color={palette["label.secondary"]} size={20} strokeWidth={1.75} />
        </Pressable>
      )}
      <View className="flex-1 flex-row items-center gap-2">{children}</View>
      {right}
    </View>
  );
};

/** The 22px title of a pushed screen. */
export const HeaderTitle = ({ children }: { readonly children: string }) => (
  <Text accessibilityRole="header" className="font-sans text-title1 text-label-primary">
    {children}
  </Text>
);
