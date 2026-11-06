import type { TextProps as NativeTextProps } from "react-native";

import type { TypeRole } from "@pace/core";

import { cx } from "./cx.ts";
import { inkClass, type TagColor } from "./hue.ts";

/**
What a text says by its colour (spec §3.1): the label tiers, the accent's text, and the two statuses
a text may carry. Red and amber are status only, never decoration.
*/
export type TextTone =
  | "accent"
  | "danger"
  | "onAccent"
  | "onDanger"
  | "primary"
  | "quaternary"
  | "secondary"
  | "tertiary"
  | "warn";

/**
How a text from data behaves when it does not fit (spec §4.1.2 rule 2): `wrap` (the default, and
the only one for UI strings: they are never cut), `truncate` (one line, end ellipsis) or `clamp`
(`lines` lines).
*/
type Policy =
  | { readonly lines: number; readonly policy: "clamp" }
  | { readonly lines?: never; readonly policy?: "truncate" | "wrap" | undefined };

/** The heading levels a screen uses (`aria-level`; F-A11Y-05). */
export type HeadingLevel = 1 | 2 | 3 | 4;

/** The props the kit's Text owns; a caller never sets them on the native Text. */
type Owned =
  | "accessibilityRole"
  | "ellipsizeMode"
  | "maxFontSizeMultiplier"
  | "numberOfLines"
  | "role";

/**
The kit's Text (spec §4.1.1): a §3.2 type role, a tone, and a policy for what does not fit. It
yields in a row by construction (`flexShrink: 1`, `minWidth: 0`), so the control beside it keeps
its place (spec §4.1.2 rule 1).
*/
export type TextProps = {
  readonly role: TypeRole;
  /**
  `onAccent` on an accent fill, `onDanger` (the cell's colour) on the danger fill of a count;
  `quaternary` for a disabled control's label (spec §3.7).
  */
  readonly tone?: TextTone | undefined;
  /** Ink of a hue on its tint (a tag); takes the place of `tone`. */
  readonly hue?: TagColor | undefined;
  /** Tabular figures on a role that has none of its own (a duration in a meta line). */
  readonly numeric?: boolean | undefined;
  /** A heading of this level; without it the text is not a heading. */
  readonly level?: HeadingLevel | undefined;
  /** Chrome (tab labels, badges, bar buttons): font scaling capped at 1.6 (spec §3.2). */
  readonly chrome?: boolean | undefined;
  /**
  The full value of a cut text whose children are not one plain string (a name built of parts):
  the web's `title` carries it, so the value stays readable (spec §4.1.2 rule 4). A plain string
  child is its own full value.
  */
  readonly full?: string | undefined;
} & Omit<NativeTextProps, Owned> &
  Policy;

/** Each role's class, spelled out so Tailwind finds it (`numeric.live` is `text-numeric-live`). */
const ROLE_CLASS: Readonly<Record<TypeRole, string>> = {
  body: "text-body",
  callout: "text-callout",
  caption: "text-caption",
  caption2: "text-caption2",
  footnote: "text-footnote",
  headline: "text-headline",
  largeTitle: "text-largeTitle",
  "numeric.live": "text-numeric-live tabular-nums",
  "numeric.stat": "text-numeric-stat tabular-nums",
  "numeric.value": "text-numeric-value tabular-nums",
  subhead: "text-subhead",
  title1: "text-title1",
  title2: "text-title2",
};

const TONE_CLASS: Readonly<Record<TextTone, string>> = {
  accent: "text-accent-text",
  danger: "text-danger",
  onAccent: "text-accent-on",
  onDanger: "text-cell",
  primary: "text-label-primary",
  quaternary: "text-label-quaternary",
  secondary: "text-label-secondary",
  tertiary: "text-label-tertiary",
  warn: "text-warn",
};

/** A hue's ink takes the place of the tone (a tag's text on its tint). */
const toneClass = (tone: TextTone, hue: TagColor | undefined): string =>
  hue === undefined ? TONE_CLASS[tone] : inkClass(hue);

/** The largest font scale chrome follows (spec §3.2); content follows the system's in full. */
const CHROME_FONT_SCALE = 1.6;

/** Text yields, controls do not (spec §4.1.2 rule 1): React Native's default is `flexShrink: 0`. */
const YIELD = { flexShrink: 1, minWidth: 0 } as const;

/** How many lines a policy allows; `undefined` wraps. */
const linesOf = (policy: TextProps["policy"], lines: number | undefined): number | undefined => {
  if (policy === "truncate") {
    return 1;
  }
  return policy === "clamp" ? lines : undefined;
};

/**
Splits the kit's props into what the native Text gets on both platforms and what the web adds
(the policy, for the overflow sweep's mark).
*/
export const textProps = ({
  chrome = false,
  className,
  full: _full,
  hue,
  level,
  lines,
  numeric = false,
  policy = "wrap",
  role,
  style,
  tone = "primary",
  ...rest
}: TextProps) => {
  const numberOfLines = linesOf(policy, lines);
  const native: NativeTextProps = {
    ...rest,
    className: cx(
      "font-sans",
      ROLE_CLASS[role],
      numeric && "tabular-nums",
      toneClass(tone, hue),
      className,
    ),
    style: [YIELD, style],
    ...(numberOfLines !== undefined && { ellipsizeMode: "tail", numberOfLines }),
    ...(chrome && { maxFontSizeMultiplier: CHROME_FONT_SCALE }),
    ...(level !== undefined && { accessibilityRole: "header" }),
    // React Native's types lack `aria-level`; react-native-web renders it, TalkBack hears a heading.
    ...(level !== undefined && ({ "aria-level": level } as object)),
  };
  return { native, policy };
};

/** The part of a DOM element a title is set on (react-native-web hands the element to the ref). */
export type Titled = { readonly setAttribute?: (name: string, value: string) => void };

/**
A ref that writes a cut text's full value into the element's `title` (spec §4.1.2 rule 4; the
web only: react-native-web forwards no `title` prop). `undefined` when nothing is cut, or the text
is not a plain string.
*/
export const titleRef = (
  policy: NonNullable<TextProps["policy"]>,
  children: TextProps["children"],
): ((node: null | Titled) => void) | undefined => {
  if (policy === "wrap" || (typeof children !== "string" && typeof children !== "number")) {
    return undefined;
  }
  const full = String(children);
  return (node) => {
    node?.setAttribute?.("title", full);
  };
};
