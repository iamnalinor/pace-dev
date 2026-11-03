import { Pressable } from "react-native";

import { cx } from "./cx.ts";
import { Icon, type IconName } from "./icon.tsx";
import { Tooltip } from "./tooltip.tsx";

/**
A 44×44 icon action. `surface` (the Main artboard's header buttons) has a fill and a
hairline border; `plain` (back/more on pushed screens) is the bare icon. With no visible name,
it names itself in a tooltip on hover and keyboard focus (QA round 17 M7).
*/
export const IconButton = ({
  disabled = false,
  hint,
  icon,
  label,
  onPress,
  variant = "surface",
}: {
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: "plain" | "raised" | "surface";
}) => {
  return (
    <Tooltip label={label} showsOnTap={false}>
      <Pressable
        accessibilityHint={hint}
        accessibilityLabel={label}
        accessibilityRole="button"
        aria-disabled={disabled}
        className={cx(
          "h-hit-web w-hit-web items-center justify-center rounded-md active:opacity-80",
          variant === "surface" && "border border-outline bg-cell",
          variant === "raised" && "h-12 w-12 bg-fill-3",
          disabled && "opacity-40",
        )}
        disabled={disabled}
        onPress={onPress}
      >
        <Icon name={icon} tone={variant === "plain" ? "secondary" : "primary"} />
      </Pressable>
    </Tooltip>
  );
};
