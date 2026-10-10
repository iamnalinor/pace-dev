import type { LucideIcon } from "lucide-react-native";

import { ActivityIndicator, Pressable, Text } from "react-native";

import { cx } from "./cx.ts";
import { useTheme } from "./theme-provider.tsx";

export type ButtonVariant = "ghost" | "primary" | "secondary";

const CONTAINER: Readonly<Record<ButtonVariant, string>> = {
  ghost: "bg-transparent",
  primary: "bg-accent",
  secondary: "border border-line bg-surface",
};

const LABEL: Readonly<Record<ButtonVariant, string>> = {
  ghost: "text-fg2",
  primary: "text-accentFg",
  secondary: "text-fg",
};

/** The icon (if any) and the text, in the variant's colours. */
const Label = ({
  children,
  icon: Icon,
  variant,
}: {
  readonly children: string;
  readonly icon: LucideIcon | undefined;
  readonly variant: ButtonVariant;
}) => {
  const { palette } = useTheme();
  return (
    <>
      {Icon === undefined ? null : (
        <Icon
          color={variant === "primary" ? palette.accentFg : palette.fg}
          size={18}
          strokeWidth={1.75}
        />
      )}
      <Text className={cx("font-sans text-[15px] font-medium", LABEL[variant])}>{children}</Text>
    </>
  );
};

/**
A 48px-tall pill-ish button, optionally with an icon before the label; `busy` swaps the label
for a spinner and blocks presses.
*/
export const Button = ({
  busy = false,
  children,
  disabled = false,
  icon: Icon,
  onPress,
  variant = "primary",
}: {
  readonly busy?: boolean;
  readonly children: string;
  readonly disabled?: boolean;
  readonly icon?: LucideIcon;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
}) => {
  return (
    <Pressable
      accessibilityRole="button"
      aria-busy={busy}
      aria-disabled={disabled || busy}
      className={cx(
        "h-12 flex-row items-center justify-center gap-2 rounded-md px-4 active:opacity-80",
        CONTAINER[variant],
        (disabled || busy) && "opacity-50",
      )}
      disabled={disabled || busy}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator accessibilityLabel={children} />
      ) : (
        <Label icon={Icon} variant={variant}>
          {children}
        </Label>
      )}
    </Pressable>
  );
};
