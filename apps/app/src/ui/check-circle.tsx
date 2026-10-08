import { Check } from "lucide-react-native";
import { Pressable } from "react-native";

import { cx } from "./cx.ts";
import { useTheme } from "./theme-provider.tsx";

/** 11px of slop on every side make the 22px circle a 44px target. */
const SLOP = 11;

/** The round check of a task row: an outlined circle, filled once checked. */
export const CheckCircle = ({
  checked = false,
  dashed = false,
  label,
  onPress,
}: {
  readonly checked?: boolean;
  readonly dashed?: boolean;
  readonly label: string;
  readonly onPress?: () => void;
}) => {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      aria-checked={checked}
      aria-disabled={onPress === undefined}
      className={cx(
        "mt-px h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px]",
        checked ? "border-fg bg-fg" : "border-muted",
        dashed && "border-dashed",
      )}
      disabled={onPress === undefined}
      hitSlop={SLOP}
      onPress={onPress}
    >
      {checked ? <Check color={palette.bg} size={14} strokeWidth={2.5} /> : null}
    </Pressable>
  );
};
