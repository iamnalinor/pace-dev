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
    // A 48 target around the 24 circle (hitSlop does nothing on the web); the negative margin
    // keeps the row's layout as if only the circle were there.
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      aria-checked={checked}
      aria-disabled={onPress === undefined}
      className="-m-3 h-12 w-12 items-center justify-center rounded-pill"
      disabled={onPress === undefined}
      onPress={onPress}
    >
      <View
        className={cx(
          "h-6 w-6 items-center justify-center rounded-pill border-stroke",
          checked ? "border-label-primary bg-label-primary" : "border-outline",
          dashed && "border-dashed",
        )}
      >
        {checked ? <Check color={palette["bg.app"]} size={14} strokeWidth={2.5} /> : null}
      </View>
    </Pressable>
  );
};
