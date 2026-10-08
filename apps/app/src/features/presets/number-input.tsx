import { useState } from "react";
import { TextInput } from "react-native";

import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

/**
A number the person types freely: the text is kept as typed and every parseable value is
passed on, so a half-typed `0.` never jumps back. Re-mount it (a new `key`) to reset it.
*/
export const NumberInput = ({
  invalid = false,
  label,
  onChange,
  placeholder,
  value,
}: {
  readonly label: string;
  /** `undefined` shows the placeholder (the inherited value). */
  readonly value: number | undefined;
  readonly placeholder: string;
  readonly invalid?: boolean;
  readonly onChange: (value: number) => void;
}) => {
  const { palette } = useTheme();
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <TextInput
      accessibilityLabel={label}
      className={cx(
        "h-11 rounded-lg border bg-bg px-3 font-mono text-[15px] text-fg",
        invalid ? "border-warn" : "border-line",
      )}
      inputMode="decimal"
      onChangeText={(next) => {
        setText(next);
        const parsed = Number(next);
        if (next.trim() !== "" && Number.isFinite(parsed)) {
          onChange(parsed);
        }
      }}
      placeholder={placeholder}
      placeholderTextColor={palette.muted}
      value={text}
    />
  );
};
