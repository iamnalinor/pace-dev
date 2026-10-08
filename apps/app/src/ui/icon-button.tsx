import type { LucideIcon } from "lucide-react-native";

import { Pressable } from "react-native";

import { cx } from "./cx.ts";
import { useTheme } from "./theme-provider.tsx";

/**
A 44×44 icon action. `surface` (the Main artboard's header buttons) has a fill and a
hairline border; `plain` (back/more on pushed screens) is the bare icon.
*/
export const IconButton = ({
  disabled = false,
  hint,
  icon: Icon,
  label,
  onPress,
  variant = "surface",
}: {
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: "plain" | "raised" | "surface";
}) => {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="button"
      aria-disabled={disabled}
      className={cx(
        "h-11 w-11 items-center justify-center rounded-md active:opacity-80",
        variant === "surface" && "border border-line bg-surface",
        variant === "raised" && "h-12 w-12 bg-raised",
        disabled && "opacity-40",
      )}
      disabled={disabled}
      onPress={onPress}
    >
      <Icon color={variant === "plain" ? palette.fg2 : palette.fg} size={18} strokeWidth={1.75} />
    </Pressable>
  );
};
