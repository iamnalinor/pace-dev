import { Pressable, Text, View } from "react-native";

import { cx } from "./cx.ts";

export type SegmentedOption<T extends string> = { readonly label: string; readonly value: T };

/** A pill group with one selected segment (theme, language). */
export const Segmented = <T extends string>({
  onChange,
  options,
  value,
}: {
  readonly onChange: (value: T) => void;
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
}) => (
  <View className="flex-row gap-1.5">
    {options.map((option) => {
      const isSelected = option.value === value;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          className={cx(
            "h-8 items-center justify-center rounded-pill px-3",
            isSelected ? "bg-inverse" : "border border-line",
          )}
          key={option.value}
          onPress={() => {
            onChange(option.value);
          }}
        >
          <Text
            className={cx(
              "font-sans text-[12px] font-medium",
              isSelected ? "text-inverseFg" : "text-fg2",
            )}
          >
            {option.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);
