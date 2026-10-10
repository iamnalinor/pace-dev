import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { cx } from "./cx.ts";
import { useTheme } from "./theme-provider.tsx";

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
    // A 44px target around the 22px circle (hitSlop does nothing on the web); the negative
    // margin keeps the row's layout as if only the circle were there.
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      aria-checked={checked}
      aria-disabled={onPress === undefined}
      className="-m-[11px] mt-[-10px] h-11 w-11 items-center justify-center rounded-full"
      disabled={onPress === undefined}
      onPress={onPress}
    >
      <View
        className={cx(
          "h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px]",
          checked ? "border-fg bg-fg" : "border-muted",
          dashed && "border-dashed",
        )}
      >
        {checked ? <Check color={palette.bg} size={14} strokeWidth={2.5} /> : null}
      </View>
    </Pressable>
  );
};
