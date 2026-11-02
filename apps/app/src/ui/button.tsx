import type { LucideIcon } from "lucide-react-native";

import { createContext, type Ref, use, useCallback, useLayoutEffect, useRef } from "react";
import { ActivityIndicator, Pressable, Text, type View } from "react-native";

import { isFocusLost, moveFocus } from "../platform/move-focus.ts";
import { cx } from "./cx.ts";
import { ariaHotkey, formatHotkey, type Hotkey } from "./hotkeys.ts";
import { useIsWide } from "./layout.ts";
import { useTheme } from "./theme-provider.tsx";
import { KEYBOARD, useHotkey } from "./use-hotkey.tsx";

/** `danger`: a step that cannot be undone (wipe, delete): the warning colour, outlined. */
export type ButtonVariant = "danger" | "ghost" | "primary" | "secondary";

const CONTAINER: Readonly<Record<ButtonVariant, string>> = {
  danger: "border-2 border-danger bg-cell",
  ghost: "bg-transparent",
  primary: "bg-accent",
  secondary: "border border-outline bg-cell",
};

const LABEL: Readonly<Record<ButtonVariant, string>> = {
  danger: "text-danger",
  ghost: "text-label-secondary",
  primary: "text-accent-on",
  secondary: "text-label-primary",
};

const HINT: Readonly<Record<ButtonVariant, string>> = {
  danger: "text-danger",
  ghost: "text-label-secondary",
  primary: "text-accent-on",
  secondary: "text-label-secondary",
};

/**
How wide a button is. `auto`: as wide as its text on a computer's window (from 1024 px), the
container's width below (a phone's main action). `fill`: the container lays it out on every
window, the full width of a column: a sheet's actions, the halves of a split row, the main action
of a narrow centred card (which centres it instead).
*/
export type ButtonWidth = "auto" | "fill";

/** What a button inside takes when it names no width: a sheet makes its buttons fill. */
export const ButtonWidthContext = createContext<ButtonWidth>("auto");

/** On a computer's window an `auto` button keeps to its text; otherwise the container decides. */
const AT_TEXT_WIDTH = { alignSelf: "flex-start" } as const;

/** The style that keeps a button at its text's width, when it should. */
const useWidthStyle = (width: ButtonWidth | undefined): typeof AT_TEXT_WIDTH | undefined => {
  const inherited = use(ButtonWidthContext);
  const isWide = useIsWide();
  return isWide && (width ?? inherited) === "auto" ? AT_TEXT_WIDTH : undefined;
};

/** The icon in the label's colour. */
const iconColor = (variant: ButtonVariant, palette: ReturnType<typeof useTheme>["palette"]) => {
  if (variant === "primary") {
    return palette["accent.on"];
  }
  return variant === "danger" ? palette["status.danger"] : palette["label.primary"];
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
      className={cx("font-sans text-caption font-normal tabular-nums", HINT[variant])}
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
      <Text className={cx("shrink text-center font-sans text-callout font-medium", LABEL[variant])}>
        {children}
      </Text>
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

/** What the busy-focus hook remembers between renders. */
type FocusMemory = { isFocused: boolean; isRestoring: boolean; node: null | View };

/**
Keeps keyboard focus through a busy spell: a busy button is disabled, which drops focus to the
page on the web (QA round 15 M4, bug class 5); one that had focus when it turned busy takes it
back when it is pressable again (after a failure; a success usually removes it), but only if focus
is still nowhere: one the person moved meanwhile stays put (a mouse click arms it too, and a later
Space or Enter would press the button). Answers the pressable's focus handlers; the node comes with
its focus event.
*/
const useFocusThroughBusy = (isBusy: boolean) => {
  const memoryRef = useRef<FocusMemory>({ isFocused: false, isRestoring: false, node: null });
  useLayoutEffect(() => {
    const memory = memoryRef.current;
    if (isBusy) {
      memory.isRestoring = memory.isFocused;
    } else if (memory.isRestoring) {
      memory.isRestoring = false;
      if (isFocusLost()) {
        moveFocus(memory.node);
      }
    }
  }, [isBusy]);
  const onFocus = useCallback((event: { readonly currentTarget: unknown }) => {
    memoryRef.current.isFocused = true;
    memoryRef.current.node = event.currentTarget as View;
  }, []);
  const onBlur = useCallback(() => {
    memoryRef.current.isFocused = false;
  }, []);
  return { onBlur, onFocus };
};

/**
A pill-ish button at least 48px tall (a label that wraps makes it taller), optionally with an icon before the label; `busy` swaps the label
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
  ref,
  variant = "primary",
  width,
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
  /** The pressable itself, to move focus onto it. */
  readonly ref?: Ref<View> | undefined;
  readonly variant?: ButtonVariant;
  /** `auto` unless a container (a sheet) says otherwise. */
  readonly width?: ButtonWidth;
}) => {
  const isBlocked = disabled || busy;
  const widthStyle = useWidthStyle(width);
  const keyshortcuts = useButtonHotkey(hotkey, hotkeyMode === "global" && !isBlocked, onPress);
  const focus = useFocusThroughBusy(busy);
  return (
    <Pressable
      accessibilityHint={hint}
      {...keyshortcuts}
      accessibilityRole="button"
      aria-busy={busy}
      aria-disabled={isBlocked}
      className={cx(
        "min-h-12 flex-row items-center justify-center gap-2 rounded-md px-4 py-2 active:opacity-80",
        CONTAINER[variant],
        isBlocked && "opacity-50",
      )}
      disabled={isBlocked}
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onLongPress={onLongPress}
      onPress={onPress}
      ref={ref}
      style={widthStyle}
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
