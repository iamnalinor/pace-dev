import type { LucideIcon } from "lucide-react-native";

import { Pressable } from "react-native";

import { useTheme } from "./theme-provider.tsx";

/** A 44×44 header action from the Main artboard (surface fill, hairline border). */
export const IconButton = ({
  icon: Icon,
  label,
  onPress,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
}) => {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-11 w-11 items-center justify-center rounded-md border border-line bg-surface active:opacity-80"
      onPress={onPress}
    >
      <Icon color={palette.fg} size={18} strokeWidth={1.75} />
    </Pressable>
  );
};
