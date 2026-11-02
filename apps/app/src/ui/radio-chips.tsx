import { type ReactNode, useRef } from "react";
import { Text, View } from "react-native";

import type { TagColor } from "./color.tsx";

import { Chip } from "./chip.tsx";

export type RadioChoice<T extends string> = {
  readonly value: T;
  /** What the chip shows. */
  readonly text: string;
  /** Spoken instead of the text when the text alone is ambiguous (or empty). */
  readonly label?: string;
  /** An icon, drawn in the colour the chip gives it (`accent.on` once chosen). */
  readonly leading?: (color: string) => ReactNode;
  /** The chip's colour mark (a preset's, a project's, an importance's). */
  readonly color?: null | TagColor;
};

/** The keys that move the choice inside the group, and which way. */
const STEP: Readonly<Record<string, -1 | 1>> = {
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -1,
};

type KeyLike = {
  readonly key?: string;
  readonly nativeEvent?: { readonly key?: string };
  readonly preventDefault?: () => void;
};

/** How a choice was made: a press (Enter, Space, a click or a tap) or an arrow moving through. */
export type RadioVia = "arrow" | "press";

/**
A labelled radio group of chips with one tab stop, as a radio group is on the web: Tab reaches the
chosen chip, the arrows choose the next or the previous one (wrapping) and take the focus with
them (QA round 20 L7: one stop per chip), without scrolling the page as well (round 7 review 9).
`onChange` hears how the choice was made, so a caller can act on a press and leave an arrow's
choice alone (the close sheet's Reason takes the cursor only on a press).
*/
export const RadioChips = <T extends string>({
  choices,
  label,
  onChange,
  onCheckedNode,
  tall = false,
  value,
}: {
  /** Hears the chosen chip's node, for a caller that moves focus onto it. */
  readonly onCheckedNode?: (node: null | View) => void;
  readonly choices: readonly RadioChoice<T>[];
  /** Shown over the chips and naming the group. */
  readonly label: string;
  readonly onChange: (value: T, via: RadioVia) => void;
  readonly tall?: boolean;
  readonly value: T;
}) => {
  const chipsRef = useRef(new Map<T, View>());
  // With nothing chosen among them (a choice made elsewhere), the first chip is the tab stop.
  const stop = choices.some((choice) => choice.value === value) ? value : choices[0]?.value;
  const onKeyDown = (event: KeyLike): void => {
    const step = STEP[event.key ?? event.nativeEvent?.key ?? ""];
    const at = choices.findIndex((choice) => choice.value === stop);
    const next = step === undefined ? undefined : choices.at((at + step) % choices.length);
    if (next === undefined) {
      return;
    }
    event.preventDefault?.();
    onChange(next.value, "arrow");
    (chipsRef.current.get(next.value) as unknown as null | { focus?: () => void })?.focus?.();
  };
  // react-native-web passes the key events to the DOM; React Native's types do not list them.
  const keys = { onKeyDown };
  return (
    <View className="gap-2">
      <Text className="font-sans text-caption font-normal text-label-tertiary">{label}</Text>
      <View
        accessibilityLabel={label}
        className="flex-row flex-wrap gap-2"
        role="radiogroup"
        {...(keys as object)}
      >
        {choices.map((choice) => (
          <Chip
            key={choice.value}
            {...(choice.color !== undefined && { color: choice.color })}
            {...(choice.leading !== undefined && { leading: choice.leading })}
            onPress={() => {
              onChange(choice.value, "press");
            }}
            ref={(node) => {
              if (node === null) {
                chipsRef.current.delete(choice.value);
              } else {
                chipsRef.current.set(choice.value, node);
              }
              if (choice.value === value) {
                onCheckedNode?.(node);
              }
            }}
            selected={choice.value === value}
            tabIndex={choice.value === stop ? 0 : -1}
            tall={tall}
            {...(choice.label !== undefined && { label: choice.label })}
          >
            {choice.text}
          </Chip>
        ))}
      </View>
    </View>
  );
};
