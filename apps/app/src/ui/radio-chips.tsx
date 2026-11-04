import { View } from "react-native";

import type { TagColor } from "./hue.ts";
import type { IconName } from "./icon.tsx";

import { Chip } from "./chip.tsx";
import { RadioGroup, type RadioValue, type RadioVia } from "./radio-group.tsx";
import { Text } from "./text.tsx";

export type { RadioVia } from "./radio-group.tsx";

export type RadioChoice<T extends RadioValue> = {
  readonly value: T;
  /** What the chip shows. */
  readonly text: string;
  /** Spoken instead of the text when the text alone is ambiguous (or empty). */
  readonly label?: string;
  /** An inline icon, in the tone the chip gives it (`onAccent` once chosen). */
  readonly icon?: IconName;
  /** The project's or the category's hue: a dot before the text. */
  readonly color?: null | TagColor;
};

/**
A labelled row of choice chips: a `RadioGroup` (one tab stop, the arrows move the choice, QA round
20 L7 and 21 L1) with its label shown over the chips. `onChange` hears how the choice was made, so
a caller can act on a press and leave an arrow's choice alone (the close sheet's Reason takes the
cursor only on a press). The chips wrap; their 44 px targets touch row to row and never overlap.
*/
export const RadioChips = <T extends RadioValue>({
  choices,
  label,
  onChange,
  onCheckedNode,
  showLabel = true,
  tall = false,
  value,
}: {
  /** Hears the chosen chip's node, for a caller that moves focus onto it. */
  readonly onCheckedNode?: (node: null | View) => void;
  readonly choices: readonly RadioChoice<T>[];
  /** Names the group; shown over the chips unless `showLabel` is false (a label beside it says it). */
  readonly label: string;
  readonly onChange: (value: T, via: RadioVia) => void;
  readonly showLabel?: boolean;
  readonly tall?: boolean;
  readonly value: null | T;
}) => (
  <View className="gap-1">
    {showLabel ? (
      <Text role="footnote" tone="tertiary">
        {label}
      </Text>
    ) : null}
    <RadioGroup
      className="flex-row flex-wrap gap-x-2"
      label={label}
      onChange={onChange}
      value={value}
      values={choices.map((choice) => choice.value)}
    >
      {choices.map((choice) => (
        <Chip
          hue={choice.color}
          icon={choice.icon}
          key={choice.value}
          label={choice.label}
          ref={
            onCheckedNode !== undefined && choice.value === value
              ? (node: null | View) => {
                  onCheckedNode(node);
                }
              : undefined
          }
          tall={tall}
          value={choice.value}
        >
          {choice.text}
        </Chip>
      ))}
    </RadioGroup>
  </View>
);
