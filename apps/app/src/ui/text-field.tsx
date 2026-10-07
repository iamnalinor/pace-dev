import { Text, TextInput, type TextInputProps, View } from "react-native";

import { cx } from "./cx.ts";
import { useTheme } from "./theme-provider.tsx";

/** A labelled input on the raised surface; the label is also its accessible name. */
export const TextField = ({
  error,
  hint,
  label,
  multiline = false,
  ...input
}: Omit<TextInputProps, "accessibilityLabel" | "className" | "placeholderTextColor"> & {
  readonly error?: null | string;
  readonly hint?: string;
  readonly label: string;
}) => {
  const { palette } = useTheme();
  return (
    <View className="gap-1.5">
      <Text className="font-sans text-[12px] text-muted">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        className={cx(
          "rounded-lg border bg-bg px-3 font-sans text-[15px] text-fg",
          multiline ? "min-h-24 py-2.5" : "h-11",
          error === null || error === undefined ? "border-line" : "border-warn",
        )}
        multiline={multiline}
        placeholderTextColor={palette.faint}
        textAlignVertical={multiline ? "top" : "center"}
        {...input}
      />
      {error === null || error === undefined ? null : (
        <Text accessibilityLiveRegion="polite" className="font-sans text-[12px] text-warn">
          {error}
        </Text>
      )}
      {hint === undefined ? null : <Text className="font-sans text-[12px] text-muted">{hint}</Text>}
    </View>
  );
};
