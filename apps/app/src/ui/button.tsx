import { ActivityIndicator, Pressable, Text } from "react-native";

import { cx } from "./cx.ts";

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

/** A 48px-tall pill-ish button; `busy` swaps the label for a spinner and blocks presses. */
export const Button = ({
  busy = false,
  children,
  disabled = false,
  onPress,
  variant = "primary",
}: {
  readonly busy?: boolean;
  readonly children: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ busy, disabled: disabled || busy }}
    className={cx(
      "h-12 items-center justify-center rounded-md px-4 active:opacity-80",
      CONTAINER[variant],
      (disabled || busy) && "opacity-50",
    )}
    disabled={disabled || busy}
    onPress={onPress}
  >
    {busy ? (
      <ActivityIndicator />
    ) : (
      <Text className={cx("font-sans text-[15px] font-medium", LABEL[variant])}>{children}</Text>
    )}
  </Pressable>
);
