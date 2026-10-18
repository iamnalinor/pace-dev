import type { LucideIcon } from "lucide-react-native";

import { ActivityIndicator, Pressable, Text } from "react-native";

import { cx } from "./cx.ts";
import { ariaHotkey, formatHotkey, type Hotkey } from "./hotkeys.ts";
import { useTheme } from "./theme-provider.tsx";
import { KEYBOARD, useHotkey } from "./use-hotkey.tsx";

/** `danger`: a step that cannot be undone (wipe, delete): the warning colour, outlined. */
export type ButtonVariant = "danger" | "ghost" | "primary" | "secondary";

const CONTAINER: Readonly<Record<ButtonVariant, string>> = {
  danger: "border-2 border-warn bg-surface",
  ghost: "bg-transparent",
  primary: "bg-accent",
  secondary: "border border-line bg-surface",
};

const LABEL: Readonly<Record<ButtonVariant, string>> = {
  danger: "text-warn",
  ghost: "text-fg2",
  primary: "text-accentFg",
  secondary: "text-fg",
};

const HINT: Readonly<Record<ButtonVariant, string>> = {
  danger: "text-warn",
  ghost: "text-muted",
  primary: "text-accentFg",
  secondary: "text-muted",
};

/** The icon in the label's colour. */
const iconColor = (variant: ButtonVariant, palette: ReturnType<typeof useTheme>["palette"]) => {
  if (variant === "primary") {
    return palette.accentFg;
  }
  return variant === "danger" ? palette.warn : palette.fg;
};

/** The shortcut after the label, the way this computer names it; nothing without a keyboard. */
export const KeyHint = ({
  hotkey,
  variant,
}: {
  readonly hotkey: Hotkey | undefined;
  readonly variant: ButtonVariant;
}) =>
  hotkey === undefined || KEYBOARD === null ? null : (
    <Text
      aria-hidden
      className={cx("font-sans text-[12px] font-normal tabular-nums", HINT[variant])}
    >
      {formatHotkey(hotkey, KEYBOARD)}
    </Text>
  );

/** The icon (if any), the text and its shortcut, in the variant's colours. */
const Label = ({
  children,
  hotkey,
  icon: Icon,
  variant,
}: {
  readonly children: string;
  readonly hotkey: Hotkey | undefined;
  readonly icon: LucideIcon | undefined;
  readonly variant: ButtonVariant;
}) => {
  const { palette } = useTheme();
  return (
    <>
      {Icon === undefined ? null : (
        <Icon color={iconColor(variant, palette)} size={18} strokeWidth={1.75} />
      )}
      <Text className={cx("font-sans text-[15px] font-medium", LABEL[variant])}>{children}</Text>
      <KeyHint hotkey={hotkey} variant={variant} />
    </>
  );
};

/** Presses the button on its shortcut while it can be pressed; says the shortcut to screen readers. */
const useButtonHotkey = (
  hotkey: Hotkey | undefined,
  isActive: boolean,
  onPress: () => void,
): { readonly "aria-keyshortcuts"?: string } => {
  useHotkey(isActive ? hotkey : undefined, onPress);
  return hotkey === undefined || KEYBOARD === null
    ? {}
    : { "aria-keyshortcuts": ariaHotkey(hotkey, KEYBOARD) };
};

/**
A 48px-tall pill-ish button, optionally with an icon before the label; `busy` swaps the label
for a spinner and blocks presses. With a `hotkey` and a keyboard, the shortcut shows after the
label and presses the button (unless `hotkeyMode` is "hint": a field handles the key itself).
*/
export const Button = ({
  busy = false,
  children,
  disabled = false,
  hint,
  hotkey,
  hotkeyMode = "global",
  icon: Icon,
  onLongPress,
  onPress,
  variant = "primary",
}: {
  readonly busy?: boolean;
  readonly children: string;
  readonly disabled?: boolean;
  /** What a press does beyond the label (a long press, say), for screen readers. */
  readonly hint?: string;
  readonly icon?: LucideIcon;
  readonly hotkey?: Hotkey | undefined;
  readonly hotkeyMode?: "global" | "hint";
  readonly onPress: () => void;
  /** A second way in (the full close sheet behind a one-tap Done). */
  readonly onLongPress?: () => void;
  readonly variant?: ButtonVariant;
}) => {
  const isBlocked = disabled || busy;
  const keyshortcuts = useButtonHotkey(hotkey, hotkeyMode === "global" && !isBlocked, onPress);
  return (
    <Pressable
      accessibilityHint={hint}
      {...keyshortcuts}
      accessibilityRole="button"
      aria-busy={busy}
      aria-disabled={isBlocked}
      className={cx(
        "h-12 flex-row items-center justify-center gap-2 rounded-md px-4 active:opacity-80",
        CONTAINER[variant],
        isBlocked && "opacity-50",
      )}
      disabled={isBlocked}
      onLongPress={onLongPress}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator accessibilityLabel={children} />
      ) : (
        <Label hotkey={hotkey} icon={Icon} variant={variant}>
          {children}
        </Label>
      )}
    </Pressable>
  );
};
