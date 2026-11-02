import { type ReactNode, useRef } from "react";
import { Text, View } from "react-native";

import { Chip } from "./chip.tsx";

export type RadioChoice<T extends string> = {
  readonly value: T;
  /** What the chip shows. */
  readonly text: string;
  /** Spoken instead of the text when the text alone is ambiguous (or empty). */
  readonly label?: string;
  readonly leading?: ReactNode;
};

/** The keys that move the choice inside the group, and which way. */
const STEP: Readonly<Record<string, -1 | 1>> = {
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -1,
};

type KeyLike = { readonly key?: string; readonly nativeEvent?: { readonly key?: string } };

/**
A labelled radio group of chips with one tab stop, as a radio group is on the web: Tab reaches the
chosen chip, the arrows choose the next or the previous one (wrapping) and take the focus with
them (QA round 20 L7: one stop per chip).
*/
export const RadioChips = <T extends string>({
  choices,
  label,
  onChange,
  tall = false,
  value,
}: {
  readonly choices: readonly RadioChoice<T>[];
  /** Shown over the chips and naming the group. */
  readonly label: string;
  readonly onChange: (value: T) => void;
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
    onChange(next.value);
    (chipsRef.current.get(next.value) as unknown as null | { focus?: () => void })?.focus?.();
  };
  // react-native-web passes the key events to the DOM; React Native's types do not list them.
  const keys = { onKeyDown };
  return (
    <View className="gap-1.5">
      <Text className="font-sans text-[12px] text-muted">{label}</Text>
      <View
        accessibilityLabel={label}
        className="flex-row flex-wrap gap-1.5"
        role="radiogroup"
        {...(keys as object)}
      >
        {choices.map((choice) => (
          <Chip
            key={choice.value}
            leading={choice.leading}
            onPress={() => {
              onChange(choice.value);
            }}
            ref={(node) => {
              if (node === null) {
                chipsRef.current.delete(choice.value);
              } else {
                chipsRef.current.set(choice.value, node);
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
