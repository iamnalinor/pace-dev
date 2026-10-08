import { View } from "react-native";

import { Chip } from "./chip.tsx";

export type SegmentedOption<T extends string> = { readonly label: string; readonly value: T };

/** One choice out of a few (theme, language): neutral chips, the chosen one outlined. */
export const Segmented = <T extends string>({
  onChange,
  options,
  value,
}: {
  readonly onChange: (value: T) => void;
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
}) => (
  <View className="flex-row flex-wrap gap-1.5" role="radiogroup">
    {options.map((option) => (
      <Chip
        key={option.value}
        onPress={() => {
          onChange(option.value);
        }}
        selected={option.value === value}
      >
        {option.label}
      </Chip>
    ))}
  </View>
);
