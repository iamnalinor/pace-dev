import type { View } from "react-native";

import type { TextTone } from "./text-props.ts";

import { cx } from "./cx.ts";
import { type TagColor, tintClass } from "./hue.ts";
import { Icon, type IconName, type IconTone } from "./icon.tsx";
import { DISABLED } from "./pressable-props.ts";
import { Pressable } from "./pressable.tsx";
import { type RadioValue, useRadio } from "./radio-group.tsx";
import { Text } from "./text.tsx";

type Look = {
  readonly children: string;
  /** Spoken instead of the visible text when the text alone is ambiguous. */
  readonly label?: string | undefined;
  /** An inline icon before the text, in the chip's label colour. */
  readonly icon?: IconName | undefined;
  /**
  A project or a category: at rest the chip is the hue's tint under its ink, as a tag is (owner
  2026-11-08: a dot's colour cannot be told; never a dot). Chosen, it is the accent like any chip.
  */
  readonly hue?: null | TagColor | undefined;
  readonly disabled?: boolean | undefined;
  /**
  Words that must show whole (a date, an estimate, «Начать с «Отложенное»»): the chip takes its
  row's width instead of `size.chip.max`, so «Начало 5 нояб. 15:51» keeps its time (design review
  H3). A bare name (a project, a category) keeps the cap.
  */
  readonly isWhole?: boolean | undefined;
  /** 40 instead of 32: the time pills of the close sheet. */
  readonly tall?: boolean | undefined;
  /** Hears the pressable itself, for focus to be moved onto it. */
  readonly ref?: ((node: null | View) => void) | undefined;
};

/**
What the chip is (spec §4.2.6): a `value` makes it a radio of the `RadioGroup` around it (one tab
stop per group); `checked` a filter (a checkbox); `expanded` a chip that opens its picker below (a
date, an estimate); none of them an action (a button: "Read it later", "Start from").
*/
type Kind =
  | {
      readonly checked: boolean;
      readonly expanded?: never;
      readonly onPress: () => void;
      readonly value?: never;
    }
  | {
      readonly checked?: never;
      readonly expanded: boolean;
      readonly onPress: () => void;
      readonly value?: never;
    }
  | {
      readonly checked?: never;
      readonly expanded?: never;
      readonly onPress: () => void;
      readonly value?: never;
    }
  | {
      readonly checked?: never;
      readonly expanded?: never;
      readonly onPress?: never;
      readonly value: RadioValue;
    };

export type ChipProps = Kind & Look;

type Tones = { readonly icon: IconTone; readonly text: TextTone; readonly fill: string };

/**
Rest: `fill.2` under the secondary label. Chosen: the solid accent under `accent.on` (V2-02: the
quiet tint could not be told from the others; the accent is ≥ 3:1 on every ground). Disabled:
`fill.1` under `label.quaternary`, never an opacity (spec §3.7).
*/
const tonesOf = (isOn: boolean, isDisabled: boolean): Tones => {
  if (isDisabled) {
    return { fill: DISABLED.fill, icon: DISABLED.icon, text: "quaternary" };
  }
  return isOn
    ? { fill: "bg-accent", icon: "onAccent", text: "onAccent" }
    : { fill: "bg-fill-2", icon: "secondary", text: "secondary" };
};

/** The pill: [icon] · the label (one line, `size.chip.max` at most, "…" past it). */
const visualOf = (
  isOn: boolean,
  { disabled = false, hue, isWhole = false, tall = false }: Look,
): string =>
  cx(
    "min-w-8 flex-row items-center justify-center gap-2 px-3",
    isWhole ? "max-w-full" : "max-w-chip-max",
    tall ? "h-10" : "h-8",
    hasHue(isOn, disabled, hue) ? tintClass(hue) : tonesOf(isOn, disabled).fill,
  );

/** A coloured chip at rest (not chosen, not disabled) wears its hue. */
const hasHue = (isOn: boolean, isDisabled: boolean, hue: Look["hue"]): hue is TagColor =>
  !isOn && !isDisabled && hue !== undefined && hue !== null;

const Inside = ({ isOn, look }: { readonly isOn: boolean; readonly look: Look }) => {
  const tones = tonesOf(isOn, look.disabled === true);
  return (
    <>
      {look.icon === undefined ? null : <Icon name={look.icon} size="inline" tone={tones.icon} />}
      {hasHue(isOn, look.disabled === true, look.hue) ? (
        <Text hue={look.hue} policy="truncate" role="subhead">
          {look.children}
        </Text>
      ) : (
        <Text policy="truncate" role="subhead" tone={tones.text}>
          {look.children}
        </Text>
      )}
    </>
  );
};

const RadioChip = ({ look, value }: { readonly look: Look; readonly value: RadioValue }) => {
  const { checked, onPress, setNode, tabIndex } = useRadio(value);
  return (
    <Pressable
      checked={checked}
      disabled={look.disabled}
      label={look.label ?? look.children}
      onPress={onPress}
      ref={(node: null | View) => {
        setNode(node);
        look.ref?.(node);
      }}
      role="radio"
      shape="pill"
      tabIndex={tabIndex}
      visual={visualOf(checked, look)}
    >
      <Inside isOn={checked} look={look} />
    </Pressable>
  );
};

/**
A 32 pill (40 when tall) in a 48 dp / 44 px target (the small-visual pattern of the kit's
Pressable: the target is the layout box, no negative margin, so two rows of chips never overlap
their targets; QA21 L1, pr48-followups "chip rows give about 40 px"). Neutral; the accent marks the
chosen one; a coloured chip at rest is its hue's tint under its ink, never a dot (owner 2026-11-08).
*/
export const Chip = (props: ChipProps) => {
  const { checked, expanded, onPress, value, ...look } = props;
  if (value !== undefined) {
    return <RadioChip look={look} value={value} />;
  }
  const isOn = checked === true || expanded === true;
  const shared = {
    disabled: look.disabled,
    label: look.label ?? look.children,
    onPress,
    ref: look.ref,
    shape: "pill",
    visual: visualOf(isOn, look),
  } as const;
  const inside = <Inside isOn={isOn} look={look} />;
  if (checked !== undefined) {
    return (
      <Pressable {...shared} checked={checked} role="checkbox">
        {inside}
      </Pressable>
    );
  }
  return (
    <Pressable {...shared} {...(expanded !== undefined && { expanded })} role="button">
      {inside}
    </Pressable>
  );
};
