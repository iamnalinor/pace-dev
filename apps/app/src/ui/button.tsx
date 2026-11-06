import { createContext, type Ref, use, useCallback, useLayoutEffect, useRef } from "react";
import { ActivityIndicator, Text as NativeText, type View } from "react-native";

import type { ColorRole } from "@pace/core";

import type { HapticKind } from "../platform/haptics.ts";
import type { TextTone } from "./text-props.ts";

import { isFocusLost, moveFocus } from "../platform/move-focus.ts";
import { cx } from "./cx.ts";
import { ariaHotkey, formatHotkey, type Hotkey } from "./hotkeys.ts";
import { Icon, type IconName, type IconTone } from "./icon.tsx";
import { useIsWide } from "./layout.ts";
import { DISABLED } from "./pressable-props.ts";
import { Pressable } from "./pressable.tsx";
import { Text } from "./text.tsx";
import { useTheme } from "./theme-provider.tsx";
import { KEYBOARD, useHotkey } from "./use-hotkey.tsx";

/**
What a button does (spec §4.2.3): `primary` the one main action of a view (the accent),
`secondary` a tonal `fill.2` button, `plain` a text action in the accent's ink (Undo, Cancel), and
`destructive` a step that cannot be undone (Wipe data, Delete account) on the quiet danger fill.
*/
export type ButtonVariant = "destructive" | "plain" | "primary" | "secondary";

/** One geometry per size: `regular` 48 on a phone and 40 on a desktop, `small` 32 (spec §4.2.3). */
export type ButtonSize = "regular" | "small";

type Look = {
  readonly fill: string;
  readonly text: TextTone;
  readonly icon: IconTone;
  readonly spinner: ColorRole;
};

const LOOK: Readonly<Record<ButtonVariant, Look>> = {
  // Not the spec's `status.dangerQuiet` fill: the danger label measures 4.31:1 on it over the page
  // (axe, the offline Log out block), under the 4.5 of a 15 px label. The cell under a danger
  // ring keeps the label at its `bg.cell` pair (bug-lessons 123).
  destructive: {
    fill: "border-2 border-danger bg-cell",
    icon: "danger",
    spinner: "status.danger",
    text: "danger",
  },
  plain: { fill: "", icon: "accent", spinner: "accent.text", text: "accent" },
  primary: { fill: "bg-accent", icon: "onAccent", spinner: "accent.on", text: "onAccent" },
  secondary: {
    fill: "bg-fill-2",
    icon: "primary",
    spinner: "label.primary",
    text: "primary",
  },
};

/** Disabled: `fill.1` under `label.quaternary`, the same for every variant; never an opacity (F-COL-13). */
const DISABLED_LOOK: Look = {
  fill: DISABLED.fill,
  icon: DISABLED.icon,
  spinner: "label.quaternary",
  text: "quaternary",
};

const SHAPE = { regular: "md", small: "sm" } as const satisfies Record<ButtonSize, string>;

const VISUAL = "flex-row items-center justify-center gap-2 self-stretch py-2";

const HEIGHT: Readonly<Record<ButtonSize, string>> = {
  regular: "min-h-12 px-5 lg:min-h-10 lg:px-4",
  small: "min-h-8 px-3",
};

/** The shortcut's colour: the label's on primary, a step quieter on the others. */
const HINT: Readonly<Record<ButtonVariant, string>> = {
  destructive: "text-danger",
  plain: "text-label-secondary",
  primary: "text-accent-on",
  secondary: "text-label-secondary",
};

/**
How wide a button is (spec §4.2.3 Width; F-CMP-06, owner feedback 4 "too wide on a computer").
`hug`: as wide as its label, everywhere (Inbox's Accept and Delete, a row's action). `fill`: the
container lays it out, the full width of a column (a sheet's actions, the halves of a split row).
`auto` (unnamed): hugs on a computer's window (from 1024 px) and fills below, as a phone's main
action does.
*/
export type ButtonWidth = "auto" | "fill" | "hug";

/** What a button inside takes when it names no width: a sheet makes its buttons fill. */
export const ButtonWidthContext = createContext<ButtonWidth>("auto");

/** At its label's width. */
const AT_TEXT_WIDTH = { alignSelf: "flex-start" } as const;

/** The style that keeps a button at its label's width, when it should. */
const useWidthStyle = (width: ButtonWidth | undefined): typeof AT_TEXT_WIDTH | undefined => {
  const inherited = use(ButtonWidthContext);
  const isWide = useIsWide();
  const chosen = width ?? inherited;
  return chosen === "hug" || (isWide && chosen === "auto") ? AT_TEXT_WIDTH : undefined;
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
    <NativeText
      aria-hidden
      className={cx("font-sans text-footnote font-normal tabular-nums", HINT[variant])}
    >
      {formatHotkey(hotkey, KEYBOARD)}
    </NativeText>
  );

/** Presses the button on its shortcut while it can be pressed; says the shortcut to screen readers. */
const useShortcut = (
  shortcut: Hotkey | undefined,
  isActive: boolean,
  onPress: () => void,
): { readonly "aria-keyshortcuts"?: string } => {
  useHotkey(isActive ? shortcut : undefined, onPress);
  return shortcut === undefined || KEYBOARD === null
    ? {}
    : { "aria-keyshortcuts": ariaHotkey(shortcut, KEYBOARD) };
};

/**
Keeps keyboard focus through a busy spell: a busy button is disabled, which drops focus to the
page on the web (QA round 15 M4, bug class 5); one that had focus when it turned busy takes it
back when it is pressable again (after a failure; a success usually removes it), but only if focus
is still nowhere: one the person moved meanwhile stays put (a mouse click arms it too, and a later
Space or Enter would press the button). Answers the pressable's focus handlers; the node comes with
its focus event.
*/
const useFocusThroughBusy = (isBusy: boolean) => {
  /** What the busy-focus hook remembers between renders. */
  type FocusMemory = { isFocused: boolean; isRestoring: boolean; node: null | View };
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

/** The icon slot: the spinner while busy (the label stays, so the width never jumps). */
const Lead = ({
  busy,
  icon,
  isIconFilled,
  look,
}: {
  readonly busy: boolean;
  readonly icon: IconName | undefined;
  readonly isIconFilled: boolean | undefined;
  readonly look: Look;
}) => {
  const { palette } = useTheme();
  if (busy) {
    // The button is named by its label: the spinner is no second, unnamed progress bar.
    return <ActivityIndicator aria-hidden color={palette[look.spinner]} size="small" />;
  }
  return icon === undefined ? null : <Icon filled={isIconFilled} name={icon} tone={look.icon} />;
};

/**
The kit's button (spec §4.2.3) on the kit's Pressable: [icon] · the label (`callout` 600; it wraps
in Russian, never cut) · [the shortcut on a computer with a keyboard]. One geometry per size,
`radius.md`, drawn inside the 48 dp / 44 px target (the small-visual pattern: a 40 desktop or a 32
small button keeps the whole target). `busy` puts a spinner in the label's colour in the icon's
place and blocks presses (`aria-busy`; focus survives the spell). With a `shortcut` and a keyboard
the shortcut shows after the label and presses the button (unless `shortcutMode` is "hint": a field
handles the key itself).
*/
export const Button = ({
  busy = false,
  children,
  disabled = false,
  haptic,
  hint,
  icon,
  isIconFilled,
  label = children,
  onLongPress,
  onPress,
  ref,
  shortcut,
  shortcutMode = "global",
  size = "regular",
  variant = "primary",
  width,
}: {
  readonly busy?: boolean;
  readonly children: string;
  readonly disabled?: boolean;
  /** What the press means to the hand (a destructive confirm: `confirm`). */
  readonly haptic?: HapticKind | undefined;
  /** What a press does beyond the label (a long press, say), for screen readers. */
  readonly hint?: string;
  readonly icon?: IconName;
  /** The icon drawn solid (Stop's square, never an outline that reads as a checkbox; F-CMP-04). */
  readonly isIconFilled?: boolean;
  /** The name said for it when the visible text is a short form of it (it must start with it). */
  readonly label?: string;
  readonly shortcut?: Hotkey | undefined;
  readonly shortcutMode?: "global" | "hint";
  readonly onPress: () => void;
  /** A second way in (the full close sheet behind a one-tap Done). */
  readonly onLongPress?: () => void;
  /** The pressable itself, to move focus onto it. */
  readonly ref?: Ref<View> | undefined;
  readonly size?: ButtonSize;
  readonly variant?: ButtonVariant;
  /** `auto` unless a container (a sheet) says otherwise. */
  readonly width?: ButtonWidth;
}) => {
  const isBlocked = disabled || busy;
  const widthStyle = useWidthStyle(width);
  const keyshortcuts = useShortcut(shortcut, shortcutMode === "global" && !isBlocked, onPress);
  const focus = useFocusThroughBusy(busy);
  const look = disabled ? DISABLED_LOOK : LOOK[variant];
  return (
    <Pressable
      {...keyshortcuts}
      accessibilityHint={hint}
      aria-busy={busy}
      disabled={isBlocked}
      haptic={haptic}
      label={label}
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onLongPress={onLongPress}
      onPress={onPress}
      ref={ref}
      role="button"
      shape={SHAPE[size]}
      style={widthStyle}
      visual={cx(VISUAL, HEIGHT[size], look.fill)}
    >
      <Lead busy={busy} icon={icon} isIconFilled={isIconFilled} look={look} />
      <Text className="text-center font-semibold" role="callout" tone={look.text}>
        {children}
      </Text>
      <KeyHint hotkey={shortcut} variant={variant} />
    </Pressable>
  );
};
