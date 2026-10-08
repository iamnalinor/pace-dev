import { View } from "react-native";

import type { ProjectColorName } from "@pace/core";

import { Chip } from "#app/ui/chip.tsx";

/** A short list picked with one tap: the chosen value is the filled chip. */
export const ChoiceChips = <T extends number | string>({
  colorOf,
  label,
  labelOf,
  onChange,
  value,
  values,
}: {
  readonly label: string;
  readonly values: readonly T[];
  readonly value: T;
  readonly labelOf: (value: T) => string;
  readonly colorOf?: (value: T) => ProjectColorName;
  readonly onChange: (value: T) => void;
}) => (
  <View
    accessibilityLabel={label}
    accessibilityRole="radiogroup"
    className="flex-row flex-wrap gap-1.5"
  >
    {values.map((option) => (
      <Chip
        color={colorOf?.(option) ?? null}
        key={option}
        onPress={() => {
          onChange(option);
        }}
        selected={option === value}
      >
        {labelOf(option)}
      </Chip>
    ))}
  </View>
);
