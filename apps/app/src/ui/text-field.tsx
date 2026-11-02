import type { Ref } from "react";

import { Text, TextInput, type TextInputProps, View } from "react-native";

import { cx } from "./cx.ts";
import { useTheme } from "./theme-provider.tsx";

/** A labelled input on the raised surface; the label is also its accessible name. */
export const TextField = ({
  error,
  hint,
  label,
  multiline = false,
  ref,
  ...input
}: Omit<TextInputProps, "accessibilityLabel" | "className" | "placeholderTextColor"> & {
  readonly ref?: Ref<TextInput> | undefined;
  readonly error?: null | string;
  readonly hint?: string;
  readonly label: string;
}) => {
  const { palette } = useTheme();
  return (
    <View className="gap-2">
      <Text className="font-sans text-caption font-normal text-label-tertiary">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        className={cx(
          "rounded-lg border bg-app px-3 font-sans text-callout text-label-primary",
          multiline ? "min-h-24 py-3" : "h-hit-web",
          error === null || error === undefined ? "border-outline" : "border-danger",
        )}
        multiline={multiline}
        placeholderTextColor={palette["label.tertiary"]}
        ref={ref}
        textAlignVertical={multiline ? "top" : "center"}
        {...input}
      />
      {error === null || error === undefined ? null : (
        <Text
          accessibilityLiveRegion="polite"
          className="font-sans text-caption font-normal text-danger"
        >
          {error}
        </Text>
      )}
      {hint === undefined ? null : (
        <Text className="font-sans text-caption font-normal text-label-tertiary">{hint}</Text>
      )}
    </View>
  );
};
